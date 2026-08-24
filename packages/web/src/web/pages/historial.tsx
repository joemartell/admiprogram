import { useEffect, useMemo, useState } from "react";
import { Download, FileText, FolderOpen, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "../components/page-header";
import { Button } from "../components/ui/button";
import { useInstaller } from "../components/installer-provider";
import {
  MODE_LABELS,
  STATUS_LABELS,
  formatDateTime,
  formatDuration,
  installerAPI,
  statusTone,
  type JobStatus,
} from "../lib/installer";

const FILTROS: { id: "todos" | JobStatus; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "correcto", label: "Correctos" },
  { id: "fallido", label: "Fallidos" },
  { id: "requiere-admin", label: "Requieren admin" },
  { id: "cancelado", label: "Cancelados" },
];

function Historial() {
  const { history, refreshHistory, clearHistory } = useInstaller();
  const api = installerAPI();
  const [filtro, setFiltro] = useState<"todos" | JobStatus>("todos");
  const [logAbierto, setLogAbierto] = useState<string | null>(null);
  const [logTexto, setLogTexto] = useState<string>("");
  const [exportado, setExportado] = useState<string | null>(null);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const filtrado = useMemo(
    () => (filtro === "todos" ? history : history.filter((job) => job.status === filtro)),
    [history, filtro],
  );

  const verLog = async (jobId: string, logPath?: string) => {
    if (logAbierto === jobId) {
      setLogAbierto(null);
      return;
    }
    setLogAbierto(jobId);
    setLogTexto("Cargando…");
    if (!api || !logPath) {
      setLogTexto("No hay archivo de registro para esta instalación.");
      return;
    }
    try {
      setLogTexto((await api.readLog(logPath)) || "El registro está vacío.");
    } catch (error) {
      setLogTexto(error instanceof Error ? error.message : String(error));
    }
  };

  const exportar = async () => {
    const ruta = await api?.exportHistory();
    if (ruta) setExportado(ruta);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-7">
      <PageHeader
        eyebrow="registro local"
        title="Historial de instalaciones"
        description="Cada ejecución queda guardada en tu perfil con el comando exacto, el código de salida y su registro completo. Útil para justificar ante TI qué se instaló, cuándo y con qué banderas."
        actions={
          <>
            <Button variant="outline" onClick={() => void exportar()} disabled={!api || history.length === 0}>
              <Download className="size-4" />
              Exportar JSON
            </Button>
            <Button variant="danger" onClick={() => void clearHistory()} disabled={!api || history.length === 0}>
              <Trash2 className="size-4" />
              Vaciar
            </Button>
          </>
        }
      />

      {exportado && (
        <div className="panel flex flex-wrap items-center justify-between gap-2 border-success/40 bg-success/5 p-3">
          <p className="break-all font-mono text-[11px] text-success">Guardado en {exportado}</p>
          <Button size="sm" variant="quiet" onClick={() => void api?.reveal(exportado)}>
            <FolderOpen className="size-3.5" />
            Mostrar
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            className={cn(
              "rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors",
              filtro === f.id
                ? "border-accent/60 bg-accent/12 text-accent"
                : "border-border bg-surface-2/50 text-muted hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtrado.length === 0 ? (
        <div className="panel grid place-items-center gap-2 p-12 text-center">
          <FileText className="size-6 text-muted" />
          <p className="text-[14px] font-semibold">Sin instalaciones registradas</p>
          <p className="max-w-sm text-[12px] leading-relaxed text-muted">
            En cuanto ejecutes una instalación desde el instalador o el catálogo winget aparecerá aquí con su registro.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrado.map((job) => (
            <div key={job.id} className="panel overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[14px] font-semibold">{job.displayName}</p>
                    <span
                      className={cn(
                        "rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase",
                        statusTone(job.status),
                      )}
                    >
                      {STATUS_LABELS[job.status]}
                    </span>
                    {job.simulated && (
                      <span className="rounded-md border border-info/40 bg-info/10 px-2 py-0.5 font-mono text-[10px] uppercase text-info">
                        simulada
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-muted">
                    {formatDateTime(job.createdAt)} · {job.engineLabel} · {MODE_LABELS[job.mode]} ·{" "}
                    {formatDuration(job.durationMs)} · salida{" "}
                    {job.exitCode === null || job.exitCode === undefined ? "—" : job.exitCode}
                  </p>
                  <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-accent/90">
                    {job.commandPreview}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="quiet" onClick={() => void verLog(job.id, job.logPath)}>
                    <FileText className="size-3.5" />
                    {logAbierto === job.id ? "Ocultar" : "Registro"}
                  </Button>
                  {job.targetDir && (
                    <Button size="sm" variant="quiet" onClick={() => void api?.openPath(job.targetDir!)}>
                      <FolderOpen className="size-3.5" />
                      Carpeta
                    </Button>
                  )}
                </div>
              </div>

              {job.outcome && (
                <div className="border-t border-border bg-surface-2/40 px-4 py-3">
                  <p className="text-[13px] font-semibold">{job.outcome.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted">{job.outcome.detail}</p>
                  {job.outcome.suggestions.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {job.outcome.suggestions.map((s) => (
                        <li key={s} className="flex gap-2 text-[12px] leading-relaxed text-muted">
                          <span className="text-accent">·</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {logAbierto === job.id && (
                <div className="border-t border-border p-4">
                  <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-[#080909] p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-foreground/80">
                    {logTexto}
                  </pre>
                  {job.logPath && (
                    <p className="mt-2 break-all font-mono text-[10px] text-muted">{job.logPath}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Historial;
