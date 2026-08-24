/**
 * Búsqueda en winget para instalar con ámbito de usuario (--scope user),
 * la vía oficial de instalar software sin permisos de administrador.
 */
import { execFile } from "node:child_process";
import { IS_WINDOWS } from "./runner";
import type { WingetPackage } from "./types";

const DEMO: WingetPackage[] = [
  { name: "Visual Studio Code", id: "Microsoft.VisualStudioCode", version: "1.99.0", source: "winget" },
  { name: "Google Chrome", id: "Google.Chrome", version: "137.0", source: "winget" },
  { name: "7-Zip", id: "7zip.7zip", version: "24.09", source: "winget" },
  { name: "Notepad++", id: "Notepad++.Notepad++", version: "8.7", source: "winget" },
  { name: "PowerToys", id: "Microsoft.PowerToys", version: "0.90.0", source: "winget" },
  { name: "Git", id: "Git.Git", version: "2.49.0", source: "winget" },
  { name: "Zoom", id: "Zoom.Zoom", version: "6.4.0", source: "winget" },
  { name: "Firefox", id: "Mozilla.Firefox", version: "139.0", source: "winget" },
];

function run(command: string, timeout = 45_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "cmd.exe",
      ["/c", command],
      { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const out = `${stdout ?? ""}`;
        if (error && !out.trim()) {
          reject(new Error(`${stderr || error.message}`.trim()));
          return;
        }
        resolve(out);
      },
    );
  });
}

/**
 * winget imprime una tabla de ancho fijo. Se localizan las posiciones de las
 * columnas en la cabecera y se corta cada fila por esos índices.
 */
function parseTable(output: string): WingetPackage[] {
  const lines = output.split(/\r?\n/);
  const headerIndex = lines.findIndex((l) => /(^|\s)(Name|Nombre)\s+(Id|ID)\s/.test(l));
  if (headerIndex < 0) return [];

  const header = lines[headerIndex] ?? "";
  const idCol = header.search(/\b(Id|ID)\b/);
  const versionCol = header.search(/\b(Version|Versión|Versi.n)\b/);
  const sourceCol = header.search(/\b(Source|Origen|Fuente)\b/);
  if (idCol < 0) return [];

  const rows: WingetPackage[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim() || /^[-─\s]+$/.test(line)) continue;
    const name = line.slice(0, idCol).trim();
    const id = line.slice(idCol, versionCol > idCol ? versionCol : undefined).trim();
    const version = versionCol > 0 ? line.slice(versionCol, sourceCol > versionCol ? sourceCol : undefined).trim() : "";
    const source = sourceCol > 0 ? line.slice(sourceCol).trim() : "winget";
    if (!name || !id || id.includes(" ")) continue;
    rows.push({ name, id, version, source: source || "winget" });
  }
  return rows;
}

export async function searchWinget(query: string): Promise<{ packages: WingetPackage[]; simulated: boolean; message?: string }> {
  const term = query.trim();
  if (!term) return { packages: [], simulated: !IS_WINDOWS };

  if (!IS_WINDOWS) {
    const lower = term.toLowerCase();
    return {
      packages: DEMO.filter((p) => p.name.toLowerCase().includes(lower) || p.id.toLowerCase().includes(lower)),
      simulated: true,
      message: "Resultados de ejemplo: la búsqueda real en winget requiere Windows.",
    };
  }

  const safe = term.replace(/"/g, "");
  const output = await run(
    `winget search "${safe}" --accept-source-agreements --disable-interactivity`,
  );
  const packages = parseTable(output);
  return {
    packages,
    simulated: false,
    message: packages.length ? undefined : "winget no devolvió coincidencias para ese término.",
  };
}
