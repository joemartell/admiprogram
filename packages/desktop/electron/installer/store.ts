/**
 * Persistencia local: historial de trabajos y logs, siempre dentro del perfil
 * del usuario (app.getPath("userData")). Nada se escribe fuera de él.
 */
import { app } from "electron";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { InstallJob } from "./types";

const MAX_HISTORY = 500;

function dataDir(): string {
  const dir = app.getPath("userData");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function logsDir(): string {
  const dir = path.join(dataDir(), "logs");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function historyFile(): string {
  return path.join(dataDir(), "history.json");
}

export function jobLogPath(jobId: string, suffix: string): string {
  return path.join(logsDir(), `${jobId}-${suffix}`);
}

export async function readHistory(): Promise<InstallJob[]> {
  try {
    const raw = await fsp.readFile(historyFile(), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as InstallJob[]) : [];
  } catch {
    return [];
  }
}

async function writeHistory(jobs: InstallJob[]): Promise<void> {
  await fsp.writeFile(historyFile(), JSON.stringify(jobs.slice(0, MAX_HISTORY), null, 2), "utf-8");
}

/** Inserta o actualiza un trabajo (el más reciente primero). */
export async function upsertJob(job: InstallJob): Promise<void> {
  const jobs = await readHistory();
  const index = jobs.findIndex((j) => j.id === job.id);
  if (index >= 0) jobs[index] = job;
  else jobs.unshift(job);
  await writeHistory(jobs);
}

export async function clearHistory(): Promise<void> {
  await writeHistory([]);
}

export async function exportHistory(targetPath: string): Promise<string> {
  const jobs = await readHistory();
  const payload = {
    aplicacion: "Instalador Por-Usuario",
    generado: new Date().toISOString(),
    equipo: process.env.COMPUTERNAME ?? "",
    usuario: process.env.USERNAME ?? "",
    totalTrabajos: jobs.length,
    trabajos: jobs,
  };
  await fsp.writeFile(targetPath, JSON.stringify(payload, null, 2), "utf-8");
  return targetPath;
}

/** Lee el log de un trabajo (el capturado por la app o el del propio instalador). */
export async function readLogFile(logPath: string, maxBytes = 512 * 1024): Promise<string> {
  const stat = await fsp.stat(logPath);
  const start = Math.max(0, stat.size - maxBytes);
  const handle = await fsp.open(logPath, "r");
  try {
    const buf = Buffer.alloc(stat.size - start);
    await handle.read(buf, 0, buf.length, start);
    // Los logs de msiexec (/L*v) se escriben en UTF-16LE
    const isUtf16 = buf.length > 1 && buf[0] === 0xff && buf[1] === 0xfe;
    const text = isUtf16 ? buf.toString("utf16le") : buf.toString("utf-8");
    return start > 0 ? `[...log truncado, mostrando los últimos ${maxBytes} bytes...]\n${text}` : text;
  } finally {
    await handle.close();
  }
}
