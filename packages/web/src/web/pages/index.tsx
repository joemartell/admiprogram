import { useState } from "react";
import { FilePlus2, FolderOpen, Layers, PlayCircle, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "../components/page-header";
import { InstallerItem } from "../components/installer-item";
import { useInstaller } from "../components/installer-provider";
import { Button } from "../components/ui/button";
import { installerAPI } from "../lib/installer";

function DropZone() {
  const { pickFiles, addPaths, available } = useInstaller();
  const [hover, setHover] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const api = installerAPI();

  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setHover(false);
    setError(null);
    if (!api) {
      setError("Arrastrar archivos requiere la app de escritorio.");
      return;
    }
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => api.pathForFile(file))
      .filter(Boolean);
    if (paths.length === 0) {
      setError("No se pudo obtener la ruta de los archivos arrastrados.");
      return;
    }
    await addPaths(paths);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(event) => void onDrop(event)}
      className={cn(
        "rise flex flex-col items-center justify-center rounded-panel border-2 border-dashed px-6 py-10 text-center transition-colors",
        hover ? "border-accent bg-accent/8" : "border-border bg-surface/40",
      )}
    >
      <div className="grid size-11 place-items-center rounded-lg bg-accent/12 text-accent">
        <Upload className="size-5" />
      </div>
      <p className="mt-3 font-display text-[17px] font-bold">Arrastra los instaladores aquí</p>
      <p className="mt-1.5 max-w-md text-[12px] leading-relaxed text-muted">
        .msi · .exe · .msix · .appx · .zip — se analiza el motor de instalación y el manifiesto de elevación antes de
        ejecutar nada.
      </p>
      <Button className="mt-4" onClick={() => void pickFiles()} disabled={!available}>
        <FilePlus2 className="size-4" /> Seleccionar archivos
      </Button>
      {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
      {!available && (
        <p className="mt-2 text-[12px] text-warning">
          Vista previa en navegador: la detección y ejecución corren en la app de escritorio.
        </p>
      )}
    </div>
  );
}

function Index() {
  const { queue, clearQueue, runAll, busy, available, env } = useInstaller();
  const pending = queue.filter((item) => !item.jobId).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-7">
      <PageHeader
        eyebrow="instalación en el perfil del usuario"
        title="Instalar sin permisos de administrador"
        description="Cada instalador se analiza para identificar su motor y si su manifiesto exige elevación. Después se ejecuta con las banderas oficiales de instalación por-usuario y en modo silencioso, dentro de tu perfil. Si un programa exige administrador por diseño, la app lo dice y ofrece alternativas en lugar de fallar en silencio."
        actions={
          queue.length > 0 ? (
            <>
              <Button variant="outline" size="sm" onClick={clearQueue}>
                <Trash2 className="size-3.5" /> Vaciar cola
              </Button>
              <Button size="sm" disabled={!available || busy || pending === 0} onClick={() => void runAll()}>
                <PlayCircle className="size-4" /> Instalar todo ({pending})
              </Button>
            </>
          ) : undefined
        }
      />

      <DropZone />

      {queue.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="label-xs flex items-center gap-1.5">
            <Layers className="size-3" /> cola · {queue.length} instalador{queue.length === 1 ? "" : "es"}
          </p>
          {env && (
            <button
              type="button"
              onClick={() => void installerAPI()?.openPath(env.programsDir)}
              className="inline-flex items-center gap-1.5 font-mono text-[11px] text-info hover:underline"
            >
              <FolderOpen className="size-3.5" /> abrir carpeta de destino
            </button>
          )}
        </div>
      )}

      <div className="space-y-4 pb-6">
        {queue.map((item) => (
          <InstallerItem key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
}

export default Index;
