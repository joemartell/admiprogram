import { Link, useLocation } from "wouter";
import {
  Download,
  History,
  Info,
  Minus,
  PackageSearch,
  ShieldCheck,
  Square,
  Stethoscope,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDesktop } from "../hooks/use-desktop";
import { useInstaller } from "./installer-provider";

const NAV = [
  { href: "/", label: "Instalador", icon: Download },
  { href: "/catalogo", label: "Catálogo winget", icon: PackageSearch },
  { href: "/diagnostico", label: "Diagnóstico", icon: Stethoscope },
  { href: "/historial", label: "Historial", icon: History },
  { href: "/ayuda", label: "Ayuda", icon: Info },
];

function TitleBar() {
  const desktop = useDesktop();
  if (!desktop) return null;
  return (
    <div className="flex items-center gap-1 pr-1">
      <button
        type="button"
        onClick={() => void desktop.minimize()}
        className="grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        aria-label="Minimizar"
      >
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => void desktop.maximize()}
        className="grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        aria-label="Maximizar"
      >
        <Square className="size-3" />
      </button>
      <button
        type="button"
        onClick={() => void desktop.close()}
        className="grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-danger/20 hover:text-danger"
        aria-label="Cerrar"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { env, queue, available } = useInstaller();

  return (
    <div className="flex h-screen flex-col bg-background">
      <header
        className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface/80 pl-4 backdrop-blur"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div className="flex items-center gap-3">
          <div className="grid size-7 place-items-center rounded-md bg-accent text-[#14100a]">
            <ShieldCheck className="size-4" />
          </div>
          <div className="leading-none">
            <p className="font-display text-[15px] font-bold tracking-tight">Instalador Por-Usuario</p>
            <p className="label-xs mt-0.5">sin permisos de administrador</p>
          </div>
        </div>
        <div
          className="flex items-center gap-3"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {env && (
            <p className="hidden font-mono text-[11px] text-muted md:block">
              {env.userName}@{env.computerName}
              <span className={cn("ml-2 rounded px-1.5 py-0.5", env.supported ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                {env.supported ? "Windows" : "simulación"}
              </span>
            </p>
          )}
          <TitleBar />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-[212px] shrink-0 flex-col justify-between border-r border-border bg-surface/40 p-3">
          <ul className="space-y-1">
            {NAV.map((item) => {
              const active = location === item.href;
              const count = item.href === "/" ? queue.length : 0;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                      active
                        ? "bg-accent/12 text-accent"
                        : "text-muted hover:bg-surface-2 hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-4" />
                    <span className="flex-1">{item.label}</span>
                    {count > 0 && (
                      <span className="rounded bg-accent px-1.5 font-mono text-[10px] font-semibold text-[#14100a]">
                        {count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="rounded-lg border border-border bg-surface-2/50 p-3">
            <p className="label-xs">Destino por defecto</p>
            <p className="mt-1.5 break-all font-mono text-[10px] leading-relaxed text-muted">
              {env?.programsDir ?? "%LOCALAPPDATA%\\Programs"}
            </p>
            {!available && (
              <p className="mt-2 text-[11px] leading-snug text-warning">
                Abre la app de escritorio para ejecutar instalaciones.
              </p>
            )}
          </div>
        </nav>

        <main className="min-h-0 flex-1 overflow-y-auto grid-backdrop">{children}</main>
      </div>
    </div>
  );
}
