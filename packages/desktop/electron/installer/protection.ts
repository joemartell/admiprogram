/**
 * Señales de operaciones que Windows protege por diseño. Estas señales no
 * prueban por sí solas que el instalador vaya a ejecutar la operación: se
 * usan para advertir antes de iniciar y para explicar un fallo posterior.
 */
import type { CommandPlan, DetectedInstaller, ProtectedOperation } from "./types";

interface ProtectedMarkerRule {
  operation: ProtectedOperation;
  markers: string[];
}

const RULES: ProtectedMarkerRule[] = [
  {
    operation: "program-files",
    markers: ["Program Files", "ProgramFilesDir", "ProgramFilesFolder", "%ProgramFiles%", "Common Files"],
  },
  {
    operation: "hklm",
    markers: ["HKEY_LOCAL_MACHINE", "HKLM", "RegistryRoot", "RegDBSetDefaultRoot", "ALLUSERS=1"],
  },
  {
    operation: "service",
    markers: [
      "CreateService",
      "OpenSCManager",
      "StartService",
      "DeleteService",
      "InstallService",
      "ServiceInstall",
      "ServicesActive",
      "SERVICE_AUTO_START",
    ],
  },
];

export const PROTECTED_OPERATION_LABELS: Record<ProtectedOperation, string> = {
  "program-files": "escritura en Program Files",
  hklm: "modificación de HKLM",
  service: "instalación o modificación de servicios",
};

export function detectProtectedOperations(text: string): ProtectedOperation[] {
  const lower = text.toLowerCase();
  return RULES.filter(({ markers }) => markers.some((marker) => lower.includes(marker.toLowerCase()))).map(
    ({ operation }) => operation,
  );
}

export function protectedOperationWarnings(operations: ProtectedOperation[]): string[] {
  return operations.map(
    (operation) =>
      `Posible operación protegida: ${PROTECTED_OPERATION_LABELS[operation]}. Si se confirma durante la instalación, Windows puede requerir administrador.`,
  );
}

export function withProtectionWarnings(plan: CommandPlan, detected: DetectedInstaller): CommandPlan {
  const operations = mergeProtectedOperations(
    detected.protectedOperations,
    detectProtectedOperations(`${plan.preview}\n${plan.targetDir ?? ""}`),
  );
  const warnings = protectedOperationWarnings(operations);
  return warnings.length > 0 ? { ...plan, warnings: [...plan.warnings, ...warnings] } : plan;
}

export function mergeProtectedOperations(...groups: ProtectedOperation[][]): ProtectedOperation[] {
  return [...new Set(groups.flat())];
}

/** Códigos que suelen corresponder a UAC, acceso denegado o instalación de máquina. */
export function isPrivilegeFailureCode(code: number | null): boolean {
  return code !== null && [5, 740, 1223, 1603, 1625, 1730, 1925].includes(code);
}
