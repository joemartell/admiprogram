/**
 * Interpretación de códigos de salida: traduce el número crudo a un resultado
 * legible, con sugerencias cuando el fallo es por falta de administrador.
 */
import type { EngineId, JobOutcome, JobStatus } from "./types";
import type { ProtectedOperation } from "./types";
import { isPrivilegeFailureCode, PROTECTED_OPERATION_LABELS } from "./protection";

const ALTERNATIVAS = [
  "Prueba el modo portable: extrae el programa en %LOCALAPPDATA%\\Programs y crea un acceso directo en tu menú Inicio.",
  "Busca el paquete en winget con ámbito de usuario (winget install --scope user).",
  "Descarga la versión «per-user», «portable» o «MSIX» que publique el fabricante: suelen instalarse sin administrador.",
  "Si nada aplica, el programa realmente necesita cambios en el sistema: solicítalo al área de TI con el nombre y la versión exacta.",
];

interface CodeInfo {
  status: JobStatus;
  title: string;
  detail: string;
  suggestions?: string[];
}

/** Códigos de msiexec y de la mayoría de motores basados en Windows Installer. */
const MSI_CODES: Record<number, CodeInfo> = {
  0: { status: "correcto", title: "Instalación completada", detail: "El instalador terminó sin errores." },
  1602: {
    status: "cancelado",
    title: "Instalación cancelada",
    detail: "El usuario o el propio instalador canceló la operación (1602).",
  },
  1603: {
    status: "fallido",
    title: "Error irrecuperable durante la instalación",
    detail:
      "Código 1603. En equipos sin administrador casi siempre significa que el paquete intentó escribir en una ruta protegida (Program Files, HKLM) o instalar un servicio.",
    suggestions: ALTERNATIVAS,
  },
  1618: {
    status: "fallido",
    title: "Otra instalación está en curso",
    detail: "Código 1618. Windows Installer solo procesa una instalación a la vez: espera a que termine y reintenta.",
  },
  1619: {
    status: "fallido",
    title: "No se pudo abrir el paquete",
    detail: "Código 1619. El archivo .msi no existe, está dañado o no tienes permiso de lectura sobre él.",
  },
  1620: {
    status: "fallido",
    title: "Paquete no válido",
    detail: "Código 1620. El archivo no es un paquete de Windows Installer válido.",
  },
  1625: {
    status: "requiere-admin",
    title: "Bloqueado por política del sistema",
    detail:
      "Código 1625. Una directiva de grupo prohíbe esta instalación (por ejemplo DisableUserInstalls o DisableMSI). No es evitable desde la aplicación.",
    suggestions: ALTERNATIVAS,
  },
  1638: {
    status: "fallido",
    title: "Ya existe otra versión instalada",
    detail: "Código 1638. Desinstala la versión existente o usa el instalador de actualización.",
  },
  1633: {
    status: "fallido",
    title: "Plataforma no compatible",
    detail: "Código 1633. El paquete no admite esta arquitectura (por ejemplo x86 vs x64/ARM).",
  },
  1925: {
    status: "requiere-admin",
    title: "El paquete exige privilegios de máquina",
    detail:
      "Código 1925. El MSI no fue construido con soporte por-usuario, así que MSIINSTALLPERUSER=1 no puede aplicarse: solo admite instalación para todos los usuarios.",
    suggestions: ALTERNATIVAS,
  },
  [-51]: {
    status: "requiere-admin",
    title: "InstallShield no pudo crear la carpeta de destino",
    detail: "InstallShield devolvió -51: la carpeta solicitada no pudo crearse con los permisos actuales.",
    suggestions: ALTERNATIVAS,
  },
  [-52]: {
    status: "requiere-admin",
    title: "InstallShield no pudo acceder a una ruta protegida",
    detail: "InstallShield devolvió -52: no pudo acceder a un archivo o carpeta con los permisos actuales.",
    suggestions: ALTERNATIVAS,
  },
  1730: {
    status: "requiere-admin",
    title: "Se requiere ser administrador",
    detail: "Código 1730. El paquete comprueba explícitamente pertenencia al grupo Administradores.",
    suggestions: ALTERNATIVAS,
  },
  3010: {
    status: "reinicio-requerido",
    title: "Instalación correcta, requiere reiniciar",
    detail: "Código 3010. Los archivos quedaron instalados; reinicia para completar la configuración.",
  },
  1641: {
    status: "reinicio-requerido",
    title: "Instalación correcta, reinicio iniciado",
    detail: "Código 1641. El instalador solicitó el reinicio del equipo.",
  },
};

/** Códigos comunes de ejecutables de Windows y de motores no-MSI. */
const GENERIC_CODES: Record<number, CodeInfo> = {
  0: { status: "correcto", title: "Instalación completada", detail: "El proceso terminó con código 0." },
  1: {
    status: "fallido",
    title: "El instalador devolvió error",
    detail:
      "Código 1. Suele indicar banderas no admitidas o una condición previa incumplida. Revisa el log y prueba el modo personalizado.",
  },
  2: {
    status: "cancelado",
    title: "Instalación cancelada",
    detail: "Código 2. El instalador abortó antes de aplicar cambios.",
  },
  5: {
    status: "requiere-admin",
    title: "Acceso denegado",
    detail: "Código 5. El instalador intentó escribir donde tu usuario no tiene permiso.",
    suggestions: ALTERNATIVAS,
  },
  740: {
    status: "requiere-admin",
    title: "Requiere elevación",
    detail:
      "Código 740. El ejecutable exige elevación (UAC) por manifiesto: no hay forma de instalarlo en el perfil del usuario.",
    suggestions: ALTERNATIVAS,
  },
  1223: {
    status: "requiere-admin",
    title: "Elevación rechazada",
    detail: "Código 1223. Se pidió elevación mediante UAC y no se concedió.",
    suggestions: ALTERNATIVAS,
  },
  1260: {
    status: "requiere-admin",
    title: "Bloqueado por AppLocker o directiva de restricción de software",
    detail:
      "Código 1260. Una política del equipo impide ejecutar este programa. Esto lo decide el administrador del dominio.",
    suggestions: ALTERNATIVAS,
  },
  3010: {
    status: "reinicio-requerido",
    title: "Instalación correcta, requiere reiniciar",
    detail: "Código 3010.",
  },
};

/** Inno Setup usa códigos propios en el rango 1..8. */
const INNO_CODES: Record<number, CodeInfo> = {
  1: { status: "fallido", title: "Fallo al inicializar el instalador", detail: "Inno Setup: código 1." },
  2: { status: "cancelado", title: "Cancelado en la primera pantalla", detail: "Inno Setup: código 2." },
  3: {
    status: "fallido",
    title: "Error interno o fase de preparación fallida",
    detail: "Inno Setup: código 3. Puede indicar que /CURRENTUSER no está permitido por el instalador.",
    suggestions: ALTERNATIVAS,
  },
  4: { status: "fallido", title: "Error fatal durante la instalación", detail: "Inno Setup: código 4." },
  5: { status: "cancelado", title: "Cancelado por el usuario", detail: "Inno Setup: código 5." },
  6: { status: "cancelado", title: "Proceso terminado externamente", detail: "Inno Setup: código 6." },
  8: {
    status: "reinicio-requerido",
    title: "Requiere reiniciar para completar",
    detail: "Inno Setup: código 8.",
  },
};

export function interpretExit(
  code: number | null,
  engine: EngineId,
  killedByTimeout = false,
  protectedOperations: ProtectedOperation[] = [],
): JobOutcome {
  if (killedByTimeout) {
    return {
      exitCode: code,
      status: "fallido",
      title: "Tiempo de espera agotado",
      detail:
        "El instalador excedió el tiempo máximo y se detuvo. Puede que estuviera esperando una confirmación en una ventana oculta: revisa las banderas silenciosas.",
      suggestions: ["Aumenta el tiempo límite o usa el modo personalizado con las banderas silenciosas correctas."],
    };
  }

  if (code === null) {
    return {
      exitCode: null,
      status: "fallido",
      title: "El proceso terminó sin código de salida",
      detail: "El instalador fue interrumpido antes de reportar un resultado.",
      suggestions: [],
    };
  }

  if (protectedOperations.length > 0 && isPrivilegeFailureCode(code)) {
    const areas = protectedOperations.map((operation) => PROTECTED_OPERATION_LABELS[operation]).join(", ");
    return {
      exitCode: code,
      status: "requiere-admin",
      title: "El instalador intentó una operación protegida",
      detail: `El proceso terminó con código ${code} y contiene señales relacionadas con ${areas}. Windows no permite convertir esas operaciones en por-usuario desde esta aplicación.`,
      suggestions: [
        "Selecciona una carpeta dentro de %LOCALAPPDATA%\\Programs si el asistente permite cambiar el destino.",
        "Busca una versión portable, per-user, MSIX o un paquete winget con --scope user.",
        "Si necesita servicios o HKLM, solicita al área de TI una instalación administrativa explícita.",
      ],
    };
  }

  const table =
    engine === "msi" || engine === "installshield" || engine === "burn"
      ? MSI_CODES
      : engine === "inno"
        ? { ...GENERIC_CODES, ...INNO_CODES }
        : GENERIC_CODES;

  const info = table[code] ?? MSI_CODES[code];
  if (info) {
    return {
      exitCode: code,
      status: info.status,
      title: info.title,
      detail: info.detail,
      suggestions: info.suggestions ?? [],
    };
  }

  return {
    exitCode: code,
    status: code === 0 ? "correcto" : "fallido",
    title: code === 0 ? "Instalación completada" : `El instalador devolvió el código ${code}`,
    detail:
      code === 0
        ? "El proceso terminó con código 0."
        : `Código de salida ${code} no catalogado. Revisa el log del instalador para el detalle exacto.`,
    suggestions: code === 0 ? [] : ALTERNATIVAS,
  };
}

export { ALTERNATIVAS };
