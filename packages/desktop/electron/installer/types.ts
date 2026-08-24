/**
 * Tipos compartidos del motor de instalación por-usuario.
 * Espejo en packages/web/src/web/lib/installer.ts (mantener sincronizados).
 */

/** Motor de instalación detectado en el archivo. */
export type EngineId =
  | "msi"
  | "inno"
  | "nsis"
  | "installshield"
  | "burn"
  | "squirrel"
  | "msix"
  | "archive"
  | "msu"
  | "winget"
  | "unknown";

/** Estrategia de instalación aplicada. */
export type InstallMode =
  | "peruser" // silenciosa en el perfil del usuario, sin elevación
  | "installshield-user" // InstallShield clásico: registra/reproduce Setup.iss
  | "portable" // extracción a %LOCALAPPDATA%\Programs + acceso directo
  | "winget-user" // winget install --scope user
  | "custom"; // línea de comandos editada por el usuario

export type ProtectedOperation = "program-files" | "hklm" | "service";

export type ElevationHint = "asInvoker" | "highestAvailable" | "requireAdministrator" | "unknown";

export interface DetectionEvidence {
  marker: string;
  engine: EngineId;
}

export interface DetectedInstaller {
  path: string;
  fileName: string;
  extension: string;
  sizeBytes: number;
  engine: EngineId;
  engineLabel: string;
  /** 0..1 — confianza de la detección del motor. */
  confidence: number;
  evidence: DetectionEvidence[];
  /** Nivel de ejecución declarado en el manifiesto del binario. */
  elevation: ElevationHint;
  /** true cuando el manifiesto exige administrador: no hay instalación por-usuario posible. */
  blockedByManifest: boolean;
  /** Modos aplicables, el primero es el recomendado. */
  supportedModes: InstallMode[];
  /** Advertencias legibles para el usuario. */
  notes: string[];
  /** Señales estáticas de operaciones que Windows puede proteger. */
  protectedOperations: ProtectedOperation[];
}

export interface PlanOptions {
  mode: InstallMode;
  /** Carpeta destino (por-usuario). Si se omite se usa el destino por defecto del motor. */
  targetDir?: string;
  /** Argumentos crudos cuando mode === "custom". */
  customArgs?: string;
  /** Id de paquete winget cuando mode === "winget-user". */
  wingetId?: string;
}

export interface CommandPlan {
  /** Ejecutable a lanzar. */
  file: string;
  /** Argumentos como lista (vacío cuando se usa rawCommandLine). */
  args: string[];
  /** Línea de comandos literal (NSIS /D, InstallShield /v"..."). */
  rawCommandLine?: string;
  /** Vista previa para mostrar en la interfaz. */
  preview: string;
  /** Ruta del log verboso que genera el propio instalador, si aplica. */
  installerLogPath?: string;
  targetDir?: string;
  mode: InstallMode;
  engine: EngineId;
  /** Explicación de cada bandera usada. */
  flagExplanations: { flag: string; meaning: string }[];
  /** true si el plan no puede ejecutarse sin elevación. */
  requiresAdmin: boolean;
  warnings: string[];
}

export type JobStatus =
  | "pendiente"
  | "ejecutando"
  | "correcto"
  | "reinicio-requerido"
  | "requiere-admin"
  | "fallido"
  | "cancelado";

export interface JobOutcome {
  exitCode: number | null;
  status: JobStatus;
  title: string;
  detail: string;
  /** Sugerencias cuando no se pudo instalar sin admin. */
  suggestions: string[];
}

export interface InstallJob {
  id: string;
  createdAt: number;
  finishedAt?: number;
  durationMs?: number;
  displayName: string;
  sourcePath: string;
  engine: EngineId;
  engineLabel: string;
  mode: InstallMode;
  commandPreview: string;
  targetDir?: string;
  status: JobStatus;
  exitCode?: number | null;
  outcome?: JobOutcome;
  logPath?: string;
  simulated: boolean;
}

export interface LogLine {
  jobId: string;
  at: number;
  stream: "stdout" | "stderr" | "sistema";
  text: string;
}

export interface RunRequest {
  detected?: DetectedInstaller;
  options: PlanOptions;
  displayName?: string;
  /** Minutos antes de abortar el proceso. */
  timeoutMinutes?: number;
}

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: "ok" | "aviso" | "error" | "info";
  value: string;
  detail: string;
}

export interface Diagnostics {
  platform: string;
  supported: boolean;
  userName: string;
  localAppData: string;
  programsDir: string;
  checks: DiagnosticCheck[];
  generatedAt: number;
}

export interface WingetPackage {
  name: string;
  id: string;
  version: string;
  source: string;
}
