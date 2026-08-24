import { useState } from "react";
import { Download, Loader2, PackageSearch, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "../components/page-header";
import { LogConsole } from "../components/log-console";
import { useInstaller } from "../components/installer-provider";
import { Button } from "../components/ui/button";
import { installerAPI, STATUS_LABELS, statusTone, type InstallJob, type WingetPackage } from "../lib/installer";

const SUGERENCIAS = ["Visual Studio Code", "7-Zip", "Notepad++", "Chrome", "PowerToys", "Git"];

function Catalogo() {
  const { available, runRequest, logs, jobs } = useInstaller();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WingetPackage[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [lastJobId, setLastJobId] = useState<string | null>(null);
  const api = installerAPI();

  const search = async (term: string) => {
    if (!api || !term.trim()) return;
    setSearching(true);
    setMessage(null);
    try {
      const response = await api.wingetSearch(term);
      setResults(response.packages);
      setMessage(response.message ?? null);
    } catch (error) {
      setResults([]);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSearching(false);
    }
  };

  const install = async (pkg: WingetPackage) => {
    setInstalling(pkg.id);
    try {
      const job: InstallJob | null = await runRequest({
        options: { mode: "winget-user", wingetId: pkg.id },
        displayName: `${pkg.name} (${pkg.id})`,
        timeoutMinutes: 30,
      });
      if (job) setLastJobId(job.id);
    } finally {
      setInstalling(null);
    }
  };

  const job = lastJobId ? jobs[lastJobId] : undefined;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-7">
      <PageHeader
        eyebrow="repositorio oficial de microsoft"
        title="Catálogo winget · ámbito de usuario"
        description="winget install --scope user es la vía soportada por Microsoft para instalar software en el perfil del usuario sin elevación. Si el paquete publica una versión por-usuario, se instala sin pedir nada; si solo existe versión de máquina, winget lo informa explícitamente."
      />

      <div className="panel p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void search(query);
              }}
              placeholder="Buscar un programa por nombre o identificador"
              className="w-full rounded-lg border border-border bg-surface-2/60 py-2.5 pl-9 pr-3 text-[13px] outline-none placeholder:text-muted/60 focus:border-accent/60"
            />
          </div>
          <Button onClick={() => void search(query)} disabled={!available || searching || !query.trim()}>
            {searching ? <Loader2 className="size-4 animate-spin" /> : <PackageSearch className="size-4" />}
            Buscar
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGERENCIAS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setQuery(s);
                void search(s);
              }}
              className="rounded-md border border-border bg-surface-2/50 px-2 py-1 font-mono text-[11px] text-muted transition-colors hover:border-accent/50 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
        {message && <p className="mt-3 text-[12px] text-warning">{message}</p>}
      </div>

      {results.length > 0 && (
        <div className="panel divide-y divide-border overflow-hidden">
          {results.map((pkg) => (
            <div key={pkg.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold">{pkg.name}</p>
                <p className="mt-0.5 font-mono text-[11px] text-muted">
                  {pkg.id} · v{pkg.version || "—"} · {pkg.source}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!available || installing !== null}
                onClick={() => void install(pkg)}
              >
                {installing === pkg.id ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                Instalar para mi usuario
              </Button>
            </div>
          ))}
        </div>
      )}

      {job && (
        <div className="panel space-y-3 p-4">
          <div className="flex items-center justify-between">
            <p className="font-display text-[15px] font-bold">{job.displayName}</p>
            <span className={cn("rounded-md border px-2 py-1 font-mono text-[10px] uppercase", statusTone(job.status))}>
              {STATUS_LABELS[job.status]}
            </span>
          </div>
          <p className="break-all font-mono text-[11px] text-accent">{job.commandPreview}</p>
          {job.outcome && (
            <div className="rounded-lg border border-border bg-surface-2/50 p-3">
              <p className="text-[13px] font-semibold">{job.outcome.title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">{job.outcome.detail}</p>
            </div>
          )}
          <LogConsole lines={logs[job.id] ?? []} className="max-h-72" />
        </div>
      )}
    </div>
  );
}

export default Catalogo;
