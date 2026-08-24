import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  FolderOpen,
  Loader2,
  Play,
  ShieldAlert,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { LogConsole } from "./log-console";
import { useInstaller, type QueueItem } from "./installer-provider";
import {
  formatBytes,
  installerAPI,
  MODE_DESCRIPTIONS,
  MODE_LABELS,
  STATUS_LABELS,
  statusTone,
  type CommandPlan,
} from "../lib/installer";

const ELEVATION_LABEL: Record<string, string> = {
  asInvoker: "asInvoker · no pide elevación",
  highestAvailable: "highestAvailable · usa tus permisos",
  requireAdministrator: "requireAdministrator · exige admin",
  unknown: "manifiesto no declarado",
};

function OutcomeBlock({ item }: { item: QueueItem }) {
  const { jobs } = useInstaller();
  const job = item.jobId ? jobs[item.jobId] : undefined;
  if (!job?.outcome) return null;
  const { outcome } = job;

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        outcome.status === "correcto"
          ? "border-success/40 bg-success/8"
          : outcome.status === "reinicio-requerido"
            ? "border-warning/40 bg-warning/8"
            : "border-danger/40 bg-danger/8",
      )}
    >
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        {outcome.status !== "correcto" && <ShieldAlert className="size-4" />}
        {outcome.title}
        {outcome.exitCode !== null && (
          <span className="font-mono text-[11px] font-normal text-muted">código {outcome.exitCode}</span>
        )}
      </p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{outcome.detail}</p>
      {outcome.suggestions.length > 0 && (
        <ul className="mt-2 space-y-1">
          {outcome.suggestions.map((s) => (
            <li key={s} className="flex gap-2 text-[12px] leading-relaxed text-foreground/75">
              <span className="text-accent">→</span>
              {s}
            </li>
          ))}
        </ul>
      )}
      {job.targetDir && (
        <button
          type="button"
          onClick={() => void installerAPI()?.openPath(job.targetDir ?? "")}
          className="mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] text-info hover:underline"
        >
          <FolderOpen className="size-3.5" /> abrir {job.targetDir}
        </button>
      )}
    </div>
  );
}

export function InstallerItem({ item }: { item: QueueItem }) {
  const { updateItem, removeItem, runItem, cancel, jobs, logs, busy, available } = useInstaller();
  const [plan, setPlan] = useState<CommandPlan | null>(null);
  const [showFlags, setShowFlags] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const api = installerAPI();
  const job = item.jobId ? jobs[item.jobId] : undefined;
  const running = job?.status === "ejecutando";
  const jobLogs = item.jobId ? (logs[item.jobId] ?? []) : [];

  useEffect(() => {
    if (!api) return;
    let active = true;
    void api
      .plan({
        detected: item.detected,
        options: {
          mode: item.mode,
          targetDir: item.targetDir || undefined,
          customArgs: item.customArgs || undefined,
        },
      })
      .then((result) => {
        if (active) setPlan(result);
      })
      .catch(() => setPlan(null));
    return () => {
      active = false;
    };
  }, [api, item.detected, item.mode, item.targetDir, item.customArgs]);

  useEffect(() => {
    if (running) setShowLog(true);
  }, [running]);

  const chooseTarget = async () => {
    const picked = await api?.chooseTarget(item.targetDir || undefined);
    if (picked) updateItem(item.key, { targetDir: picked });
  };

  return (
    <article className="rise panel overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 p-4">
        <div className="min-w-0">
          <p className="truncate font-display text-[16px] font-bold" title={item.detected.fileName}>
            {item.detected.fileName}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted">
            <span className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-foreground/80">
              {item.detected.engineLabel}
            </span>
            <span>confianza {Math.round(item.detected.confidence * 100)}%</span>
            <span>{formatBytes(item.detected.sizeBytes)}</span>
            <span
              className={cn(
                item.detected.blockedByManifest ? "text-danger" : item.detected.elevation === "asInvoker" ? "text-success" : "",
              )}
            >
              {ELEVATION_LABEL[item.detected.elevation]}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {job && (
            <span className={cn("rounded-md border px-2 py-1 font-mono text-[10px] uppercase", statusTone(job.status))}>
              {STATUS_LABELS[job.status]}
            </span>
          )}
          {running ? (
            <Button variant="danger" size="sm" onClick={() => void cancel(job.id)}>
              <X className="size-3.5" /> Detener
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={!available || busy}
              onClick={() => void runItem(item.key)}
              title={available ? undefined : "Requiere la app de escritorio"}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
              {job ? "Reintentar" : "Instalar"}
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={() => removeItem(item.key)} aria-label="Quitar de la cola">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </header>

      <div className="space-y-4 p-4">
        <div>
          <p className="label-xs">Modo de instalación</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.detected.supportedModes.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => updateItem(item.key, { mode })}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                  item.mode === mode
                    ? "border-accent/60 bg-accent/12 text-accent"
                    : "border-border bg-surface-2/50 text-muted hover:text-foreground",
                )}
              >
                {MODE_LABELS[mode]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">{MODE_DESCRIPTIONS[item.mode]}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_140px]">
          <label className="block">
            <span className="label-xs">Carpeta destino (tu perfil)</span>
            <input
              value={item.targetDir}
              onChange={(event) => updateItem(item.key, { targetDir: event.target.value })}
              placeholder={plan?.targetDir ?? "%LOCALAPPDATA%\\Programs\\..."}
              className="mt-1.5 w-full rounded-md border border-border bg-surface-2/60 px-2.5 py-2 font-mono text-[11px] outline-none placeholder:text-muted/60 focus:border-accent/60"
            />
          </label>
          <div className="flex items-end">
            <Button variant="outline" size="sm" onClick={() => void chooseTarget()} disabled={!available}>
              <FolderOpen className="size-3.5" /> Elegir
            </Button>
          </div>
          <label className="block">
            <span className="label-xs">Límite (min)</span>
            <input
              type="number"
              min={1}
              max={180}
              value={item.timeoutMinutes}
              onChange={(event) => updateItem(item.key, { timeoutMinutes: Number(event.target.value) || 20 })}
              className="mt-1.5 w-full rounded-md border border-border bg-surface-2/60 px-2.5 py-2 font-mono text-[11px] outline-none focus:border-accent/60"
            />
          </label>
        </div>

        {item.mode === "custom" && (
          <label className="block">
            <span className="label-xs">Argumentos personalizados</span>
            <input
              value={item.customArgs}
              onChange={(event) => updateItem(item.key, { customArgs: event.target.value })}
              placeholder="/S /D=C:\Users\...\Programs\app"
              className="mt-1.5 w-full rounded-md border border-border bg-surface-2/60 px-2.5 py-2 font-mono text-[11px] outline-none placeholder:text-muted/60 focus:border-accent/60"
            />
          </label>
        )}

        {plan && (
          <div className="rounded-lg border border-border bg-[#080909] p-3">
            <p className="label-xs flex items-center gap-1.5">
              <Terminal className="size-3" /> Comando exacto
            </p>
            <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-accent">{plan.preview}</p>
            {plan.flagExplanations.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowFlags((v) => !v)}
                  className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted hover:text-foreground"
                >
                  <ChevronDown className={cn("size-3 transition-transform", showFlags && "rotate-180")} />
                  qué hace cada bandera
                </button>
                {showFlags && (
                  <dl className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
                    {plan.flagExplanations.map((f) => (
                      <div key={f.flag} className="flex gap-3">
                        <dt className="w-40 shrink-0 font-mono text-[11px] text-info">{f.flag}</dt>
                        <dd className="text-[12px] leading-relaxed text-muted">{f.meaning}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </>
            )}
          </div>
        )}

        {(item.detected.notes.length > 0 || (plan?.warnings.length ?? 0) > 0) && (
          <ul className="space-y-1.5">
            {[...item.detected.notes, ...(plan?.warnings ?? [])].map((note) => (
              <li key={note} className="flex gap-2 text-[12px] leading-relaxed text-muted">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                {note}
              </li>
            ))}
          </ul>
        )}

        <OutcomeBlock item={item} />

        {item.jobId && (
          <div>
            <button
              type="button"
              onClick={() => setShowLog((v) => !v)}
              className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted hover:text-foreground"
            >
              <ChevronDown className={cn("size-3 transition-transform", showLog && "rotate-180")} />
              registro ({jobLogs.length})
            </button>
            {showLog && (
              <div className="mt-2">
                <LogConsole lines={jobLogs} className="max-h-64" />
                {job?.logPath && (
                  <button
                    type="button"
                    onClick={() => void api?.reveal(job.logPath ?? "")}
                    className="mt-1.5 font-mono text-[10px] text-info hover:underline"
                  >
                    ver archivo de log
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
