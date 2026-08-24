/**
 * Ejecución de instaladores: lanza el proceso con las banderas del plan, emite
 * el log en vivo al renderer, aplica tiempo límite y guarda el resultado.
 *
 * Fuera de Windows la ejecución real no aplica: se corre una simulación
 * claramente marcada para poder revisar la interfaz.
 */
import { BrowserWindow } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { buildPlan } from "./plan";
import { interpretExit } from "./outcome";
import { jobLogPath, upsertJob } from "./store";
import type { CommandPlan, InstallJob, JobStatus, LogLine, RunRequest } from "./types";

export const IS_WINDOWS = process.platform === "win32";

const DEFAULT_TIMEOUT_MIN = 20;
const running = new Map<string, { child: ChildProcess | null; cancelled: boolean }>();

function emit(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function pushLog(jobId: string, stream: LogLine["stream"], text: string, sink: fs.WriteStream): void {
  const line: LogLine = { jobId, at: Date.now(), stream, text };
  sink.write(`[${new Date(line.at).toISOString()}] [${stream}] ${text}\n`);
  emit("installer:log", line);
}

function emitJob(job: InstallJob): void {
  emit("installer:job", job);
  void upsertJob(job);
}

/** Trocea el buffer del proceso en líneas legibles. */
function lineSplitter(onLine: (text: string) => void): (chunk: Buffer) => void {
  let carry = "";
  return (chunk: Buffer) => {
    carry += chunk.toString("utf-8");
    const parts = carry.split(/\r?\n/);
    carry = parts.pop() ?? "";
    for (const part of parts) {
      const clean = part.trim();
      if (clean) onLine(clean);
    }
    if (carry.length > 8192) {
      onLine(carry);
      carry = "";
    }
  };
}

export function planFor(request: RunRequest, jobId: string): CommandPlan {
  if (!request.detected) throw new Error("Falta el archivo detectado para construir el plan.");
  const suffix = request.options.mode === "winget-user" ? "winget.log" : "instalador.log";
  return buildPlan(request.detected, request.options, jobLogPath(jobId, suffix));
}

/** Vista previa del plan sin ejecutar nada. */
export function previewPlan(request: RunRequest): CommandPlan {
  return planFor(request, "preview");
}

async function simulate(job: InstallJob, plan: CommandPlan, sink: fs.WriteStream): Promise<InstallJob> {
  const steps = [
    `Simulación (${process.platform}): la ejecución real de instaladores solo ocurre en Windows.`,
    `Motor detectado: ${job.engineLabel}`,
    `Comando que se ejecutaría: ${plan.preview}`,
    plan.targetDir ? `Destino por-usuario: ${plan.targetDir}` : "Destino: el predeterminado del motor",
    "Comprobando permisos de escritura en el perfil del usuario... correcto",
    "Aplicando banderas de instalación por-usuario y silenciosa... correcto",
    "Simulación finalizada con código 0.",
  ];
  for (const step of steps) {
    pushLog(job.id, "sistema", step, sink);
    await new Promise((r) => setTimeout(r, 220));
  }
  const outcome = interpretExit(0, plan.engine);
  return { ...job, status: outcome.status, exitCode: 0, outcome };
}

export async function runInstall(request: RunRequest): Promise<InstallJob> {
  const jobId = randomUUID();
  const plan = planFor(request, jobId);
  const displayName =
    request.displayName ??
    request.options.wingetId ??
    request.detected?.fileName ??
    "Instalación";

  const appLogPath = jobLogPath(jobId, "app.log");
  const sink = fs.createWriteStream(appLogPath, { flags: "a" });

  let job: InstallJob = {
    id: jobId,
    createdAt: Date.now(),
    displayName,
    sourcePath: request.detected?.path ?? request.options.wingetId ?? "",
    engine: plan.engine,
    engineLabel: request.detected?.engineLabel ?? "winget (repositorio)",
    mode: plan.mode,
    commandPreview: plan.preview,
    targetDir: plan.targetDir,
    status: "ejecutando",
    logPath: appLogPath,
    simulated: !IS_WINDOWS,
  };
  emitJob(job);

  pushLog(jobId, "sistema", `Trabajo iniciado: ${displayName}`, sink);
  pushLog(jobId, "sistema", `Modo: ${plan.mode} · Motor: ${job.engineLabel}`, sink);
  pushLog(jobId, "sistema", `Comando: ${plan.preview}`, sink);
  for (const warning of plan.warnings) pushLog(jobId, "sistema", `Aviso: ${warning}`, sink);

  const wingetId = request.options.wingetId?.trim();
  if (plan.mode === "winget-user" && !wingetId) {
    const outcome = {
      exitCode: null,
      status: "fallido" as JobStatus,
      title: "Falta el identificador del paquete de winget",
      detail:
        "No se ejecutó winget porque el identificador está vacío. Un archivo .exe local no contiene necesariamente el ID de su paquete en winget.",
      suggestions: [
        "Escribe el ID exacto del paquete, por ejemplo Microsoft.VisualStudioCode.",
        "Para instalar el .exe seleccionado, usa Por-usuario silenciosa, Portable o Personalizada.",
      ],
    };
    pushLog(jobId, "sistema", outcome.title, sink);
    job = { ...job, status: outcome.status, exitCode: null, outcome, finishedAt: Date.now(), durationMs: 0 };
    emitJob(job);
    sink.end();
    return job;
  }

  if (plan.requiresAdmin) {
    const outcome = {
      exitCode: null,
      status: "requiere-admin" as JobStatus,
      title: "No se puede instalar sin administrador",
      detail: plan.warnings[0] ?? "El instalador exige elevación por diseño.",
      suggestions: [
        "Prueba el modo portable (extraer en %LOCALAPPDATA%\\Programs).",
        "Busca el paquete en winget con --scope user.",
        "Solicita a TI la instalación del programa indicando nombre y versión.",
      ],
    };
    pushLog(jobId, "sistema", outcome.title, sink);
    job = { ...job, status: outcome.status, outcome, finishedAt: Date.now(), durationMs: 0 };
    emitJob(job);
    sink.end();
    return job;
  }

  if (!IS_WINDOWS) {
    job = await simulate(job, plan, sink);
    job.finishedAt = Date.now();
    job.durationMs = job.finishedAt - job.createdAt;
    emitJob(job);
    sink.end();
    return job;
  }

  const entry = { child: null as ChildProcess | null, cancelled: false };
  running.set(jobId, entry);

  const finished = await new Promise<InstallJob>((resolve) => {
    let killedByTimeout = false;

    const spawnOptions = {
      windowsHide: true,
      cwd: request.detected ? path.dirname(request.detected.path) : undefined,
      shell: plan.file === "winget",
      windowsVerbatimArguments: Boolean(plan.rawCommandLine),
    };

    const child = plan.rawCommandLine
      ? spawn(plan.rawCommandLine, [], { ...spawnOptions, shell: true })
      : spawn(plan.file, plan.args, spawnOptions);

    entry.child = child;

    const timeoutMs = (request.timeoutMinutes ?? DEFAULT_TIMEOUT_MIN) * 60_000;
    const timer = setTimeout(() => {
      killedByTimeout = true;
      pushLog(jobId, "sistema", "Tiempo límite alcanzado: se detiene el proceso.", sink);
      child.kill();
    }, timeoutMs);

    child.stdout?.on("data", lineSplitter((text) => pushLog(jobId, "stdout", text, sink)));
    child.stderr?.on("data", lineSplitter((text) => pushLog(jobId, "stderr", text, sink)));

    child.on("error", (error) => {
      clearTimeout(timer);
      pushLog(jobId, "stderr", `No se pudo lanzar el proceso: ${error.message}`, sink);
      resolve({
        ...job,
        status: "fallido",
        exitCode: null,
        outcome: {
          exitCode: null,
          status: "fallido",
          title: "No se pudo iniciar el instalador",
          detail: error.message,
          suggestions: ["Verifica que la ruta del archivo siga existiendo y que no esté bloqueado por el antivirus."],
        },
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const outcome = entry.cancelled
        ? {
            exitCode: code,
            status: "cancelado" as JobStatus,
            title: "Cancelado por el usuario",
            detail: "El proceso se detuvo desde la aplicación.",
            suggestions: [],
          }
        : interpretExit(code, plan.engine, killedByTimeout);
      pushLog(jobId, "sistema", `Proceso finalizado con código ${code} — ${outcome.title}`, sink);
      resolve({ ...job, status: outcome.status, exitCode: code, outcome });
    });
  });

  running.delete(jobId);
  const done: InstallJob = {
    ...finished,
    finishedAt: Date.now(),
    durationMs: Date.now() - finished.createdAt,
  };
  emitJob(done);
  sink.end();
  return done;
}

export function cancelJob(jobId: string): boolean {
  const entry = running.get(jobId);
  if (!entry?.child) return false;
  entry.cancelled = true;
  entry.child.kill();
  return true;
}
