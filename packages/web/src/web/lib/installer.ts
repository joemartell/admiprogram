/**
 * Tipos y acceso al motor de instalación expuesto por el proceso principal de
 * Electron (espejo de packages/desktop/electron/installer/types.ts).
 */

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

export type InstallMode = "peruser" | "installshield-user" | "portable" | "winget-user" | "custom";
export type ProtectedOperation = "program-files" | "hklm" | "service";

export type ElevationHint = "asInvoker" | "highestAvailable" | "requireAdministrator" | "unknown";

export interface DetectedInstaller {
  path: string;
  fileName: string;
  extension: string;
  sizeBytes: number;
  engine: EngineId;
  engineLabel: string;
  confidence: number;
  evidence: { marker: string; engine: EngineId }[];
  elevation: ElevationHint;
  blockedByManifest: boolean;
  supportedModes: InstallMode[];
  notes: string[];
  protectedOperations: ProtectedOperation[];
}

export interface PlanOptions {
  mode: InstallMode;
  targetDir?: string;
  customArgs?: string;
  wingetId?: string;
}

export interface CommandPlan {
  file: string;
  args: string[];
  rawCommandLine?: string;
  preview: string;
  installerLogPath?: string;
  targetDir?: string;
  mode: InstallMode;
  engine: EngineId;
  flagExplanations: { flag: string; meaning: string }[];
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

export interface InstallerEnv {
  platform: string;
  supported: boolean;
  userName: string;
  computerName: string;
  programsDir: string;
  logsDir: string;
  dataDir: string;
  appVersion: string;
}

export interface InstallerAPI {
  env: () => Promise<InstallerEnv>;
  pick: () => Promise<DetectedInstaller[]>;
  detect: (paths: string[]) => Promise<DetectedInstaller[]>;
  defaultTarget: (fileName: string) => Promise<string>;
  chooseTarget: (suggested?: string) => Promise<string | null>;
  plan: (request: RunRequest) => Promise<CommandPlan>;
  run: (request: RunRequest) => Promise<InstallJob>;
  cancel: (jobId: string) => Promise<boolean>;
  history: () => Promise<InstallJob[]>;
  clearHistory: () => Promise<void>;
  exportHistory: () => Promise<string | null>;
  readLog: (logPath: string) => Promise<string>;
  diagnostics: () => Promise<Diagnostics>;
  wingetSearch: (query: string) => Promise<{ packages: WingetPackage[]; simulated: boolean; message?: string }>;
  openPath: (target: string) => Promise<string | null>;
  reveal: (target: string) => Promise<void>;
  pathForFile: (file: File) => string;
  onLog: (cb: (line: LogLine) => void) => () => void;
  onJob: (cb: (job: InstallJob) => void) => () => void;
}

export function installerAPI(): InstallerAPI | null {
  return window.electronAPI?.installer ?? null;
}

export const MODE_LABELS: Record<InstallMode, string> = {
  peruser: "Por-usuario silenciosa",
  "installshield-user": "InstallShield por-usuario",
  portable: "Portable en el perfil",
  "winget-user": "winget ámbito usuario",
  custom: "Personalizada",
};

export const PROTECTED_OPERATION_LABELS: Record<ProtectedOperation, string> = {
  "program-files": "Program Files",
  hklm: "HKLM",
  service: "servicios de Windows",
};

export const MODE_DESCRIPTIONS: Record<InstallMode, string> = {
  peruser:
    "Ejecuta el instalador con las banderas oficiales de instalación en el perfil del usuario y sin interfaz. No requiere administrador.",
  "installshield-user":
    "Para InstallShield clásico: registra tus elecciones en la primera ejecución y después las reproduce sin elevación desde el perfil del usuario.",
  portable:
    "Extrae o copia el programa en %LOCALAPPDATA%\\Programs y crea un acceso directo en tu menú Inicio. Siempre funciona sin permisos.",
  "winget-user":
    "Instala el paquete desde el repositorio de winget con --scope user, la vía oficial de Microsoft sin elevación.",
  custom: "Tú escribes los argumentos exactos que recibirá el instalador.",
};

export const STATUS_LABELS: Record<JobStatus, string> = {
  pendiente: "Pendiente",
  ejecutando: "Ejecutando",
  correcto: "Correcto",
  "reinicio-requerido": "Requiere reinicio",
  "requiere-admin": "Requiere administrador",
  fallido: "Fallido",
  cancelado: "Cancelado",
};

export function statusTone(status: JobStatus): string {
  switch (status) {
    case "correcto":
      return "text-success border-success/40 bg-success/10";
    case "reinicio-requerido":
      return "text-warning border-warning/40 bg-warning/10";
    case "requiere-admin":
    case "fallido":
      return "text-danger border-danger/40 bg-danger/10";
    case "ejecutando":
      return "text-accent border-accent/40 bg-accent/10";
    default:
      return "text-muted border-border bg-surface-2";
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

export function formatDuration(ms?: number): string {
  if (!ms || ms < 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
