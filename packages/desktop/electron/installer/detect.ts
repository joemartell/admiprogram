/**
 * Detección del motor de instalación: extensión + husmeo de firmas en el binario
 * + lectura del nivel de ejecución declarado en el manifiesto (UAC).
 */
import fs from "node:fs/promises";
import path from "node:path";
import type {
  DetectedInstaller,
  DetectionEvidence,
  ElevationHint,
  EngineId,
  InstallMode,
} from "./types";

const CHUNK = 1024 * 1024; // 1 MiB
const MAX_SCAN = 96 * 1024 * 1024; // no husmear más de 96 MiB
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export const ENGINE_LABELS: Record<EngineId, string> = {
  msi: "Windows Installer (MSI)",
  inno: "Inno Setup",
  nsis: "NSIS (Nullsoft)",
  installshield: "InstallShield",
  burn: "WiX Burn (bundle)",
  squirrel: "Squirrel (Electron)",
  msix: "MSIX / APPX",
  archive: "Archivo comprimido (portable)",
  msu: "Actualización de Windows (MSU/CAB)",
  winget: "winget (repositorio)",
  unknown: "Instalador no identificado",
};

/** Marcadores ASCII buscados dentro del binario. */
const MARKERS: { marker: string; engine: EngineId; weight: number }[] = [
  { marker: "Inno Setup Setup Data", engine: "inno", weight: 0.95 },
  { marker: "JR.Inno.Setup", engine: "inno", weight: 0.9 },
  { marker: "This installation was built with Inno Setup", engine: "inno", weight: 0.9 },
  { marker: "Nullsoft.NSIS.exehead", engine: "nsis", weight: 0.95 },
  { marker: "NullsoftInst", engine: "nsis", weight: 0.9 },
  { marker: "Nullsoft Install System", engine: "nsis", weight: 0.9 },
  { marker: "InstallShield", engine: "installshield", weight: 0.85 },
  { marker: "IsSelfExtract", engine: "installshield", weight: 0.8 },
  { marker: ".wixburn", engine: "burn", weight: 0.95 },
  { marker: "WixBundle", engine: "burn", weight: 0.85 },
  { marker: "SquirrelAwareVersion", engine: "squirrel", weight: 0.9 },
  { marker: "SquirrelTemp", engine: "squirrel", weight: 0.8 },
];

const ELEVATION_MARKERS: { marker: string; level: ElevationHint }[] = [
  { marker: 'level="requireAdministrator"', level: "requireAdministrator" },
  { marker: "level='requireAdministrator'", level: "requireAdministrator" },
  { marker: 'level="highestAvailable"', level: "highestAvailable" },
  { marker: "level='highestAvailable'", level: "highestAvailable" },
  { marker: 'level="asInvoker"', level: "asInvoker" },
  { marker: "level='asInvoker'", level: "asInvoker" },
];

interface ScanResult {
  hits: Map<string, { engine: EngineId; weight: number }>;
  elevation: ElevationHint;
  headMagic: Buffer;
}

async function scanFile(filePath: string, sizeBytes: number): Promise<ScanResult> {
  const hits = new Map<string, { engine: EngineId; weight: number }>();
  let elevation: ElevationHint = "unknown";
  const headMagic = Buffer.alloc(8);

  const handle = await fs.open(filePath, "r");
  try {
    await handle.read(headMagic, 0, 8, 0);

    const limit = Math.min(sizeBytes, MAX_SCAN);
    const overlap = 128; // los marcadores no se pierden en el corte entre bloques
    let position = 0;
    let tail = Buffer.alloc(0);

    while (position < limit) {
      const size = Math.min(CHUNK, limit - position);
      const buf = Buffer.alloc(size);
      const { bytesRead } = await handle.read(buf, 0, size, position);
      if (bytesRead <= 0) break;

      const window = Buffer.concat([tail, buf.subarray(0, bytesRead)]);
      const text = window.toString("latin1");

      for (const { marker, engine, weight } of MARKERS) {
        if (!hits.has(marker) && text.includes(marker)) {
          hits.set(marker, { engine, weight });
        }
      }

      if (elevation !== "requireAdministrator") {
        for (const { marker, level } of ELEVATION_MARKERS) {
          if (text.includes(marker)) {
            // requireAdministrator manda sobre el resto
            if (level === "requireAdministrator" || elevation === "unknown") elevation = level;
          }
        }
      }

      tail = window.subarray(Math.max(0, window.length - overlap));
      position += bytesRead;
    }
  } finally {
    await handle.close();
  }

  return { hits, elevation, headMagic };
}

function modesFor(engine: EngineId, blocked: boolean): InstallMode[] {
  if (blocked) return ["portable", "winget-user", "custom"];
  switch (engine) {
    case "msi":
    case "inno":
    case "nsis":
    case "installshield":
    case "burn":
    case "squirrel":
      return ["peruser", "custom", "winget-user"];
    case "msix":
      return ["peruser", "custom"];
    case "archive":
      return ["portable"];
    case "msu":
      return ["winget-user"];
    default:
      return ["custom", "peruser", "portable", "winget-user"];
  }
}

/** Analiza un archivo y devuelve el motor detectado con sus modos aplicables. */
export async function detectInstaller(filePath: string): Promise<DetectedInstaller> {
  const stat = await fs.stat(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  let engine: EngineId = "unknown";
  let confidence = 0.2;
  const notes: string[] = [];
  const evidence: DetectionEvidence[] = [];
  let elevation: ElevationHint = "unknown";

  const archiveExts = [".zip", ".7z", ".rar", ".tar", ".gz"];

  if (extension === ".msi") {
    engine = "msi";
    confidence = 0.9;
  } else if (extension === ".msix" || extension === ".appx" || extension === ".msixbundle" || extension === ".appxbundle") {
    engine = "msix";
    confidence = 0.95;
    notes.push(
      "MSIX/APPX se instala siempre en el perfil del usuario y no necesita administrador, siempre que el paquete esté firmado con un certificado de confianza del equipo.",
    );
  } else if (extension === ".msu" || extension === ".cab") {
    engine = "msu";
    confidence = 0.9;
    notes.push(
      "Las actualizaciones MSU/CAB se aplican al sistema operativo: exigen administrador por diseño y no admiten instalación por-usuario.",
    );
  } else if (archiveExts.includes(extension)) {
    engine = "archive";
    confidence = 0.9;
    if (extension !== ".zip") {
      notes.push(
        "Solo .zip se extrae de forma nativa. Para .7z o .rar necesitas la herramienta correspondiente disponible en el PATH.",
      );
    }
  }

  const scannable = [".exe", ".msi", ".zip", ".msix", ".appx"].includes(extension) || engine === "unknown";
  if (scannable && stat.size > 0) {
    const scan = await scanFile(filePath, stat.size);
    elevation = scan.elevation;

    if (extension === ".msi" && !scan.headMagic.subarray(0, 8).equals(OLE_MAGIC)) {
      notes.push("La extensión es .msi pero el archivo no tiene la firma OLE esperada; puede estar dañado.");
      confidence = 0.5;
    }
    if ((extension === ".msix" || extension === ".appx") && !scan.headMagic.subarray(0, 4).equals(ZIP_MAGIC)) {
      notes.push("El paquete no tiene la firma ZIP esperada; puede estar dañado.");
      confidence = 0.5;
    }

    // El motor solo se decide por firmas cuando la extensión no lo determina (.exe o desconocido)
    const scores = new Map<EngineId, number>();
    for (const [marker, info] of scan.hits) {
      evidence.push({ marker, engine: info.engine });
      scores.set(info.engine, Math.max(scores.get(info.engine) ?? 0, info.weight));
    }

    if (extension === ".exe" || engine === "unknown") {
      let best: EngineId = "unknown";
      let bestScore = 0;
      for (const [candidate, score] of scores) {
        if (score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      if (best !== "unknown") {
        engine = best;
        confidence = bestScore;
      } else if (extension === ".exe") {
        engine = "unknown";
        confidence = 0.25;
        notes.push(
          "No se reconoció el motor del instalador. Puedes usar el modo personalizado y probar banderas silenciosas habituales (/S, /silent, /quiet, --silent).",
        );
      }
    }
  }

  const blockedByManifest = elevation === "requireAdministrator";
  if (blockedByManifest) {
    notes.push(
      "El manifiesto del ejecutable exige administrador (requireAdministrator): Windows pedirá elevación siempre y no existe instalación por-usuario para este binario. Usa una alternativa portable o winget con ámbito de usuario.",
    );
  } else if (elevation === "highestAvailable") {
    notes.push(
      "El manifiesto declara highestAvailable: sin credenciales de administrador se ejecutará con tus permisos, así que la instalación por-usuario puede funcionar.",
    );
  }

  if (engine === "msi") {
    notes.push(
      "La instalación por-usuario de un MSI (MSIINSTALLPERUSER=1) solo funciona si el paquete se creó con soporte por-usuario. Si no, msiexec devuelve 1925.",
    );
  }
  if (engine === "inno") {
    notes.push(
      "Inno Setup admite /CURRENTUSER solo si el instalador se compiló con PrivilegesRequiredOverridesAllowed. Si no, se ignorará la bandera.",
    );
  }
  if (engine === "nsis") {
    notes.push(
      "En NSIS la bandera /CurrentUser existe únicamente si el instalador usa MultiUser.nsh. Si el destino sigue siendo Program Files, define una carpeta en tu perfil.",
    );
  }
  if (engine === "squirrel") {
    notes.push("Los instaladores Squirrel ya instalan en %LOCALAPPDATA% por defecto: no requieren administrador.");
  }

  return {
    path: filePath,
    fileName,
    extension,
    sizeBytes: stat.size,
    engine,
    engineLabel: ENGINE_LABELS[engine],
    confidence,
    evidence,
    elevation,
    blockedByManifest,
    supportedModes: modesFor(engine, blockedByManifest),
    notes,
  };
}

export async function detectMany(paths: string[]): Promise<DetectedInstaller[]> {
  const out: DetectedInstaller[] = [];
  for (const p of paths) {
    try {
      out.push(await detectInstaller(p));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      out.push({
        path: p,
        fileName: path.basename(p),
        extension: path.extname(p).toLowerCase(),
        sizeBytes: 0,
        engine: "unknown",
        engineLabel: ENGINE_LABELS.unknown,
        confidence: 0,
        evidence: [],
        elevation: "unknown",
        blockedByManifest: false,
        supportedModes: ["custom"],
        notes: [`No se pudo leer el archivo: ${message}`],
      });
    }
  }
  return out;
}
