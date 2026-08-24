import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  Info as InfoIcon,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "../components/page-header";
import { Button } from "../components/ui/button";
import { installerAPI, formatDateTime, type DiagnosticCheck, type Diagnostics } from "../lib/installer";

const TONE: Record<DiagnosticCheck["status"], { icon: typeof CheckCircle2; color: string; label: string }> = {
  ok: { icon: CheckCircle2, color: "text-success", label: "Correcto" },
  aviso: { icon: AlertTriangle, color: "text-warning", label: "Aviso" },
  error: { icon: XCircle, color: "text-danger", label: "Bloqueado" },
  info: { icon: InfoIcon, color: "text-info", label: "Información" },
};

function Diagnostico() {
  const api = installerAPI();
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.diagnostics());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = {
    error: data?.checks.filter((c) => c.status === "error").length ?? 0,
    aviso: data?.checks.filter((c) => c.status === "aviso").length ?? 0,
    ok: data?.checks.filter((c) => c.status === "ok").length ?? 0,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-7">
      <PageHeader
        eyebrow="comprobación del entorno"
        title="Diagnóstico del equipo"
        description="Verifica antes de instalar si tu perfil permite instalaciones por-usuario: permisos de escritura en tus carpetas, directivas de grupo que bloqueen instalaciones, disponibilidad de winget y espacio en disco. Ninguna comprobación modifica el sistema."
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={!api || loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Volver a comprobar
          </Button>
        }
      />

      {!api && (
        <div className="panel border-warning/40 bg-warning/5 p-4 text-[13px] text-warning">
          El diagnóstico solo está disponible dentro de la aplicación de escritorio.
        </div>
      )}

      {error && (
        <div className="panel border-danger/40 bg-danger/5 p-4 font-mono text-[12px] text-danger">{error}</div>
      )}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Comprobaciones correctas", value: counts.ok, tone: "text-success" },
              { label: "Avisos", value: counts.aviso, tone: "text-warning" },
              { label: "Bloqueos detectados", value: counts.error, tone: "text-danger" },
            ].map((card) => (
              <div key={card.label} className="panel p-4">
                <p className="label-xs">{card.label}</p>
                <p className={cn("mt-1 font-display text-[30px] font-extrabold leading-none", card.tone)}>
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <div className="panel p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="label-xs">Usuario y plataforma</p>
                <p className="mt-1 font-mono text-[12px] text-muted">
                  {data.userName} · {data.platform} {data.supported ? "" : "(modo simulación)"}
                </p>
              </div>
              <div>
                <p className="label-xs">Última comprobación</p>
                <p className="mt-1 font-mono text-[12px] text-muted">{formatDateTime(data.generatedAt)}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="label-xs">Carpeta de programas del usuario</p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="min-w-0 flex-1 break-all font-mono text-[12px] text-accent">{data.programsDir}</p>
                  <Button
                    size="sm"
                    variant="quiet"
                    onClick={() => void api?.openPath(data.programsDir)}
                    disabled={!data.supported}
                  >
                    <FolderOpen className="size-3.5" />
                    Abrir
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="panel divide-y divide-border overflow-hidden">
            {data.checks.map((check) => {
              const tone = TONE[check.status];
              return (
                <div key={check.id} className="flex gap-3 p-4">
                  <tone.icon className={cn("mt-0.5 size-4 shrink-0", tone.color)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14px] font-semibold">{check.label}</p>
                      <span className={cn("font-mono text-[10px] uppercase", tone.color)}>{tone.label}</span>
                    </div>
                    <p className="mt-0.5 break-all font-mono text-[11px] text-accent/90">{check.value}</p>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{check.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!data && api && loading && (
        <div className="panel grid place-items-center gap-2 p-10 text-muted">
          <Loader2 className="size-5 animate-spin" />
          <p className="text-[13px]">Comprobando el entorno…</p>
        </div>
      )}
    </div>
  );
}

export default Diagnostico;
