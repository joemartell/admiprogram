/**
 * Construcción del plan de instalación: banderas oficiales de instalación
 * por-usuario y silenciosa para cada motor, con su explicación.
 */
import path from "node:path";
import type { CommandPlan, DetectedInstaller, EngineId, PlanOptions } from "./types";

const SYSTEM_ROOT = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";

export const MSIEXEC = path.join(SYSTEM_ROOT, "System32", "msiexec.exe");
export const POWERSHELL = path.join(
  SYSTEM_ROOT,
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);

/** %LOCALAPPDATA%\Programs — destino estándar de instalaciones por-usuario. */
export function userProgramsDir(): string {
  const local = process.env.LOCALAPPDATA ?? path.join(process.env.USERPROFILE ?? "C:\\", "AppData", "Local");
  return path.join(local, "Programs");
}

function slug(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "aplicacion";
}

export function defaultTargetDir(fileName: string): string {
  return path.join(userProgramsDir(), slug(fileName));
}

function quote(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

function preview(file: string, args: string[], raw?: string): string {
  if (raw) return raw;
  return [quote(file), ...args.map(quote)].join(" ");
}

const PER_USER_MSI_PROPS = ["ALLUSERS=2", "MSIINSTALLPERUSER=1"];

interface BuildContext {
  detected: DetectedInstaller;
  options: PlanOptions;
  logPath: string;
}

function msiPlan({ detected, options, logPath }: BuildContext): CommandPlan {
  const targetDir = options.targetDir || defaultTargetDir(detected.fileName);
  const args = [
    "/i",
    detected.path,
    "/qn",
    "/norestart",
    ...PER_USER_MSI_PROPS,
    `INSTALLDIR=${targetDir}`,
    `TARGETDIR=${targetDir}`,
    "/L*v",
    logPath,
  ];
  return {
    file: MSIEXEC,
    args,
    preview: preview(MSIEXEC, args),
    installerLogPath: logPath,
    targetDir,
    mode: "peruser",
    engine: "msi",
    requiresAdmin: false,
    warnings: [],
    flagExplanations: [
      { flag: "/i", meaning: "Instalar el paquete indicado." },
      { flag: "/qn", meaning: "Silencioso total, sin interfaz ni preguntas." },
      { flag: "/norestart", meaning: "No reiniciar el equipo al terminar." },
      { flag: "ALLUSERS=2", meaning: "Deja que el paquete decida el ámbito; obligatorio para el modo por-usuario." },
      { flag: "MSIINSTALLPERUSER=1", meaning: "Fuerza la instalación en el perfil del usuario actual (sin administrador)." },
      { flag: "INSTALLDIR / TARGETDIR", meaning: "Carpeta destino dentro de tu perfil de usuario." },
      { flag: "/L*v", meaning: "Log verboso completo para diagnosticar fallos." },
    ],
  };
}

function innoPlan({ detected, options, logPath }: BuildContext): CommandPlan {
  const targetDir = options.targetDir || defaultTargetDir(detected.fileName);
  const args = [
    "/VERYSILENT",
    "/SUPPRESSMSGBOXES",
    "/NORESTART",
    "/NOCANCEL",
    "/CURRENTUSER",
    `/DIR=${targetDir}`,
    `/LOG=${logPath}`,
  ];
  return {
    file: detected.path,
    args,
    preview: preview(detected.path, args),
    installerLogPath: logPath,
    targetDir,
    mode: "peruser",
    engine: "inno",
    requiresAdmin: false,
    warnings: [],
    flagExplanations: [
      { flag: "/VERYSILENT", meaning: "Sin ventanas ni barra de progreso." },
      { flag: "/SUPPRESSMSGBOXES", meaning: "Acepta automáticamente los cuadros de mensaje." },
      { flag: "/NORESTART", meaning: "No reiniciar al terminar." },
      { flag: "/NOCANCEL", meaning: "Impide la cancelación a mitad de la instalación." },
      { flag: "/CURRENTUSER", meaning: "Instala solo para el usuario actual, sin elevación." },
      { flag: "/DIR", meaning: "Carpeta destino dentro de tu perfil." },
      { flag: "/LOG", meaning: "Registro detallado del instalador." },
    ],
  };
}

function nsisPlan({ detected, options }: BuildContext): CommandPlan {
  const targetDir = options.targetDir || defaultTargetDir(detected.fileName);
  // En NSIS /D debe ser el último parámetro y NO admite comillas: se construye
  // la línea de comandos literal.
  const raw = `${quote(detected.path)} /S /CurrentUser /D=${targetDir}`;
  return {
    file: detected.path,
    args: [],
    rawCommandLine: raw,
    preview: raw,
    targetDir,
    mode: "peruser",
    engine: "nsis",
    requiresAdmin: false,
    warnings: [
      "NSIS no genera log propio: el resultado se juzga por el código de salida y por la aparición de la carpeta destino.",
    ],
    flagExplanations: [
      { flag: "/S", meaning: "Modo silencioso." },
      { flag: "/CurrentUser", meaning: "Ámbito de usuario actual (solo si el instalador usa MultiUser.nsh)." },
      { flag: "/D=", meaning: "Carpeta destino; debe ir al final y sin comillas por exigencia de NSIS." },
    ],
  };
}

function installShieldPlan({ detected, options, logPath }: BuildContext): CommandPlan {
  const targetDir = options.targetDir || defaultTargetDir(detected.fileName);
  const inner = `/qn /norestart ${PER_USER_MSI_PROPS.join(" ")} INSTALLDIR="${targetDir}" /L*v "${logPath}"`;
  const raw = `${quote(detected.path)} /s /v"${inner}"`;
  return {
    file: detected.path,
    args: [],
    rawCommandLine: raw,
    preview: raw,
    installerLogPath: logPath,
    targetDir,
    mode: "peruser",
    engine: "installshield",
    requiresAdmin: false,
    warnings: [],
    flagExplanations: [
      { flag: "/s", meaning: "Silencia el envoltorio de InstallShield." },
      { flag: '/v"..."', meaning: "Pasa las banderas entre comillas al msiexec interno." },
      { flag: "MSIINSTALLPERUSER=1", meaning: "Instalación en el perfil del usuario actual." },
    ],
  };
}

function burnPlan({ detected, options, logPath }: BuildContext): CommandPlan {
  const targetDir = options.targetDir || defaultTargetDir(detected.fileName);
  const args = ["/quiet", "/norestart", "/log", logPath, ...PER_USER_MSI_PROPS, `INSTALLFOLDER=${targetDir}`];
  return {
    file: detected.path,
    args,
    preview: preview(detected.path, args),
    installerLogPath: logPath,
    targetDir,
    mode: "peruser",
    engine: "burn",
    requiresAdmin: false,
    warnings: [
      "Los bundles WiX Burn suelen encadenar requisitos previos (runtimes) que sí exigen administrador; si alguno falla, el bundle completo se detiene.",
    ],
    flagExplanations: [
      { flag: "/quiet", meaning: "Sin interfaz." },
      { flag: "/norestart", meaning: "No reiniciar." },
      { flag: "/log", meaning: "Log del bundle." },
      { flag: "MSIINSTALLPERUSER=1", meaning: "Se propaga a los MSI internos como ámbito de usuario." },
    ],
  };
}

function squirrelPlan({ detected }: BuildContext): CommandPlan {
  const args = ["--silent"];
  return {
    file: detected.path,
    args,
    preview: preview(detected.path, args),
    targetDir: path.join(process.env.LOCALAPPDATA ?? "", "<nombre-de-la-app>"),
    mode: "peruser",
    engine: "squirrel",
    requiresAdmin: false,
    warnings: ["Squirrel ignora carpetas destino personalizadas: instala siempre en %LOCALAPPDATA%."],
    flagExplanations: [{ flag: "--silent", meaning: "Instalación silenciosa en %LOCALAPPDATA%, sin elevación." }],
  };
}

function msixPlan({ detected }: BuildContext): CommandPlan {
  const script = `$ErrorActionPreference='Stop'; Add-AppxPackage -Path ${JSON.stringify(detected.path)} -ForceApplicationShutdown; Write-Output 'Paquete agregado al usuario actual.'`;
  const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script];
  return {
    file: POWERSHELL,
    args,
    preview: `powershell -NoProfile -Command "Add-AppxPackage -Path '${detected.path}'"`,
    mode: "peruser",
    engine: "msix",
    requiresAdmin: false,
    warnings: [
      "Add-AppxPackage instala solo para el usuario actual. Si el certificado del paquete no es de confianza en el equipo, fallará y su instalación sí requeriría administrador.",
    ],
    flagExplanations: [
      { flag: "Add-AppxPackage", meaning: "Registra el paquete MSIX/APPX en el perfil del usuario actual." },
      { flag: "-ForceApplicationShutdown", meaning: "Cierra la versión anterior si está en ejecución." },
    ],
  };
}

function portablePlan({ detected, options }: BuildContext): CommandPlan {
  const targetDir = options.targetDir || defaultTargetDir(detected.fileName);
  const isZip = detected.extension === ".zip" || detected.extension === ".msix" || detected.extension === ".appx";
  const script = isZip
    ? `$ErrorActionPreference='Stop'; New-Item -ItemType Directory -Force -Path ${JSON.stringify(targetDir)} | Out-Null; Expand-Archive -LiteralPath ${JSON.stringify(detected.path)} -DestinationPath ${JSON.stringify(targetDir)} -Force; $exe = Get-ChildItem -Path ${JSON.stringify(targetDir)} -Filter *.exe -Recurse | Sort-Object Length -Descending | Select-Object -First 1; if ($exe) { $ws = New-Object -ComObject WScript.Shell; $lnk = $ws.CreateShortcut([IO.Path]::Combine($env:APPDATA,'Microsoft\\Windows\\Start Menu\\Programs', "$(Split-Path ${JSON.stringify(targetDir)} -Leaf).lnk")); $lnk.TargetPath = $exe.FullName; $lnk.WorkingDirectory = $exe.DirectoryName; $lnk.Save(); Write-Output "Acceso directo creado para $($exe.Name)" } else { Write-Output 'Extraccion completada (sin .exe detectado para el acceso directo)' }`
    : `$ErrorActionPreference='Stop'; New-Item -ItemType Directory -Force -Path ${JSON.stringify(targetDir)} | Out-Null; Copy-Item -LiteralPath ${JSON.stringify(detected.path)} -Destination ${JSON.stringify(targetDir)} -Force; Write-Output 'Archivo copiado al perfil del usuario. Ejecutalo desde alli si es portable.'`;
  const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script];
  return {
    file: POWERSHELL,
    args,
    preview: `powershell -Command "Expand-Archive -> ${targetDir}"  +  acceso directo en el menú Inicio del usuario`,
    targetDir,
    mode: "portable",
    engine: detected.engine,
    requiresAdmin: false,
    warnings: isZip
      ? []
      : ["El archivo no es un .zip: se copiará al perfil sin extraer. Solo sirve si el programa es portable."],
    flagExplanations: [
      { flag: "Expand-Archive", meaning: "Extrae el contenido en %LOCALAPPDATA%\\Programs (tu perfil, sin permisos especiales)." },
      { flag: "WScript.Shell CreateShortcut", meaning: "Crea el acceso directo en el menú Inicio del usuario actual." },
    ],
  };
}

function wingetPlan({ options }: BuildContext): CommandPlan {
  const id = options.wingetId?.trim() ?? "";
  const args = [
    "install",
    "--id",
    id,
    "--exact",
    "--scope",
    "user",
    "--silent",
    "--accept-package-agreements",
    "--accept-source-agreements",
    "--disable-interactivity",
  ];
  return {
    file: "winget",
    args,
    preview: `winget ${args.join(" ")}`,
    mode: "winget-user",
    engine: "winget",
    requiresAdmin: false,
    warnings: id
      ? [
          "Si el paquete no publica una versión de ámbito de usuario, winget devolverá que el ámbito solicitado no está disponible.",
        ]
      : ["Falta el identificador del paquete de winget."],
    flagExplanations: [
      { flag: "--scope user", meaning: "Instala en el perfil del usuario, sin elevación." },
      { flag: "--silent", meaning: "Sin interacción del instalador." },
      { flag: "--exact", meaning: "Coincidencia exacta del identificador, evita instalar otro paquete." },
      { flag: "--accept-*-agreements", meaning: "Acepta los términos de origen y paquete para que no se detenga." },
      { flag: "--disable-interactivity", meaning: "Falla en lugar de preguntar si algo requiere confirmación." },
    ],
  };
}

function customPlan({ detected, options, logPath }: BuildContext): CommandPlan {
  const raw = `${quote(detected.path)} ${options.customArgs ?? ""}`.trim();
  return {
    file: detected.path,
    args: [],
    rawCommandLine: raw,
    preview: raw,
    installerLogPath: logPath,
    targetDir: options.targetDir,
    mode: "custom",
    engine: detected.engine,
    requiresAdmin: detected.blockedByManifest,
    warnings: detected.blockedByManifest
      ? ["El manifiesto exige administrador: cualquier bandera silenciosa fallará o abrirá una petición de elevación."]
      : [],
    flagExplanations: [{ flag: "personalizado", meaning: "Argumentos escritos por ti, sin modificaciones." }],
  };
}

const PER_USER_BUILDERS: Partial<Record<EngineId, (ctx: BuildContext) => CommandPlan>> = {
  msi: msiPlan,
  inno: innoPlan,
  nsis: nsisPlan,
  installshield: installShieldPlan,
  burn: burnPlan,
  squirrel: squirrelPlan,
  msix: msixPlan,
};

/** Devuelve el plan ejecutable para el archivo detectado y el modo elegido. */
export function buildPlan(detected: DetectedInstaller, options: PlanOptions, logPath: string): CommandPlan {
  const ctx: BuildContext = { detected, options, logPath };

  if (options.mode === "winget-user") return wingetPlan(ctx);
  if (options.mode === "portable") return portablePlan(ctx);
  if (options.mode === "custom") return customPlan(ctx);

  if (detected.engine === "msu") {
    return {
      file: detected.path,
      args: [],
      preview: detected.fileName,
      mode: "peruser",
      engine: "msu",
      requiresAdmin: true,
      warnings: [
        "Las actualizaciones MSU/CAB modifican el sistema operativo: no existe instalación por-usuario y siempre requieren administrador.",
      ],
      flagExplanations: [],
    };
  }

  if (detected.blockedByManifest) {
    return {
      file: detected.path,
      args: [],
      preview: detected.fileName,
      mode: "peruser",
      engine: detected.engine,
      requiresAdmin: true,
      warnings: [
        "El manifiesto del instalador exige administrador (requireAdministrator). Windows no permite instalarlo en el perfil del usuario: prueba el modo portable o winget con ámbito de usuario.",
      ],
      flagExplanations: [],
    };
  }

  const builder = PER_USER_BUILDERS[detected.engine];
  if (builder) return builder(ctx);

  // Motor no identificado: banderas silenciosas más comunes como punto de partida.
  const args = ["/S", "/silent", "/norestart"];
  return {
    file: detected.path,
    args,
    preview: preview(detected.path, args),
    targetDir: options.targetDir,
    mode: "peruser",
    engine: "unknown",
    requiresAdmin: false,
    warnings: [
      "Motor no identificado: se prueban banderas silenciosas genéricas. Si el instalador las rechaza, usa el modo personalizado.",
    ],
    flagExplanations: [
      { flag: "/S, /silent", meaning: "Banderas silenciosas admitidas por la mayoría de motores." },
      { flag: "/norestart", meaning: "Evita reinicios automáticos." },
    ],
  };
}
