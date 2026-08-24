/**
 * Diagnóstico del equipo: qué se puede instalar sin administrador aquí y ahora.
 * Todas las comprobaciones son de solo lectura (o escritura dentro del perfil).
 */
import { execFile } from "node:child_process";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { POWERSHELL, userProgramsDir } from "./plan";
import { IS_WINDOWS } from "./runner";
import type { DiagnosticCheck, Diagnostics } from "./types";

function exec(file: string, args: string[], timeout = 15_000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, windowsHide: true, shell: false }, (error, stdout, stderr) => {
      const out = `${stdout ?? ""}${stderr ?? ""}`.trim();
      resolve({ ok: !error, out: out || (error ? error.message : "") });
    });
  });
}

function ps(script: string, timeout = 20_000) {
  return exec(POWERSHELL, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], timeout);
}

async function canWrite(dir: string): Promise<{ ok: boolean; detail: string }> {
  const probe = path.join(dir, `.permiso-${Date.now()}.tmp`);
  try {
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(probe, "prueba de escritura", "utf-8");
    await fsp.unlink(probe);
    return { ok: true, detail: "Escritura verificada creando y borrando un archivo de prueba." };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function windowsChecks(): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];

  const elevated = await ps(
    "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)",
  );
  const isAdmin = elevated.out.toLowerCase().includes("true");
  checks.push({
    id: "elevacion",
    label: "Sesión con privilegios de administrador",
    status: "info",
    value: isAdmin ? "Sí" : "No",
    detail: isAdmin
      ? "Tu sesión ya es administradora: cualquier instalador funcionará, aunque la app seguirá usando el modo por-usuario."
      : "Confirmado: sin privilegios de administrador. La app usará exclusivamente mecanismos de instalación por-usuario.",
  });

  const programs = userProgramsDir();
  const programsWrite = await canWrite(programs);
  checks.push({
    id: "programas-usuario",
    label: "Escritura en %LOCALAPPDATA%\\Programs",
    status: programsWrite.ok ? "ok" : "error",
    value: programsWrite.ok ? "Permitida" : "Denegada",
    detail: `${programs} — ${programsWrite.detail}`,
  });

  const startMenu = path.join(
    process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
  );
  const startWrite = await canWrite(startMenu);
  checks.push({
    id: "menu-inicio",
    label: "Accesos directos en tu menú Inicio",
    status: startWrite.ok ? "ok" : "aviso",
    value: startWrite.ok ? "Permitida" : "Denegada",
    detail: `${startMenu} — ${startWrite.detail}`,
  });

  const disableUser = await exec("reg.exe", [
    "query",
    "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Installer",
    "/v",
    "DisableUserInstalls",
  ]);
  const userInstallsBlocked = disableUser.ok && /0x[1-9a-f]/i.test(disableUser.out);
  checks.push({
    id: "politica-userinstalls",
    label: "Directiva DisableUserInstalls",
    status: userInstallsBlocked ? "error" : "ok",
    value: userInstallsBlocked ? "Activada" : "No aplicada",
    detail: userInstallsBlocked
      ? "Una directiva de grupo prohíbe las instalaciones MSI por-usuario en este equipo (msiexec devolverá 1625). Solo TI puede cambiarlo."
      : "No hay directiva que bloquee las instalaciones MSI en el perfil del usuario.",
  });

  const disableMsi = await exec("reg.exe", [
    "query",
    "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Installer",
    "/v",
    "DisableMSI",
  ]);
  const msiRestricted = disableMsi.ok && /0x[1-9a-f]/i.test(disableMsi.out);
  checks.push({
    id: "politica-disablemsi",
    label: "Directiva DisableMSI",
    status: msiRestricted ? "aviso" : "ok",
    value: msiRestricted ? "Restringida" : "No aplicada",
    detail: msiRestricted
      ? "Windows Installer está restringido por directiva: algunos paquetes solo podrán instalarse con permisos elevados."
      : "Windows Installer no está restringido por directiva.",
  });

  const srp = await exec("reg.exe", ["query", "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\SrpV2"]);
  checks.push({
    id: "applocker",
    label: "AppLocker / directivas de restricción de software",
    status: srp.ok ? "aviso" : "ok",
    value: srp.ok ? "Configurado" : "Sin configurar",
    detail: srp.ok
      ? "El equipo tiene reglas AppLocker. Si un instalador se bloquea con el código 1260, es esta política y no es evitable."
      : "No se detectaron reglas AppLocker en el registro del equipo.",
  });

  const winget = await exec("cmd.exe", ["/c", "winget --version"]);
  checks.push({
    id: "winget",
    label: "winget (Administrador de paquetes de Windows)",
    status: winget.ok ? "ok" : "aviso",
    value: winget.ok ? (winget.out.split(/\r?\n/)[0] ?? "Disponible") : "No disponible",
    detail: winget.ok
      ? "Disponible: puedes instalar paquetes con --scope user sin administrador."
      : "No se encontró winget. Se instala con «Instalador de aplicación» desde Microsoft Store (no requiere administrador).",
  });

  const policy = await ps("Get-ExecutionPolicy -Scope CurrentUser");
  checks.push({
    id: "powershell",
    label: "PowerShell (usado para MSIX y modo portable)",
    status: policy.ok ? "ok" : "error",
    value: policy.ok ? policy.out.split(/\r?\n/)[0] || "Undefined" : "No disponible",
    detail: policy.ok
      ? "La app invoca PowerShell con -ExecutionPolicy Bypass en el propio proceso, así que la directiva del usuario no la bloquea."
      : "No se pudo ejecutar PowerShell: el modo portable y la instalación de MSIX no estarán disponibles.",
  });

  const space = await ps(
    `$d = (Get-Item ${JSON.stringify(programs)}).PSDrive.Name; $f = (Get-PSDrive $d).Free; [math]::Round($f/1GB,1)`,
  );
  const gb = Number.parseFloat(space.out.replace(",", "."));
  checks.push({
    id: "espacio",
    label: "Espacio libre en la unidad del perfil",
    status: Number.isFinite(gb) ? (gb < 2 ? "aviso" : "ok") : "info",
    value: Number.isFinite(gb) ? `${gb} GB` : "Desconocido",
    detail: Number.isFinite(gb)
      ? gb < 2
        ? "Menos de 2 GB libres: algunas instalaciones pueden fallar por espacio."
        : "Espacio suficiente para instalaciones en el perfil del usuario."
      : "No se pudo determinar el espacio libre.",
  });

  const msiserver = await exec("sc.exe", ["query", "msiserver"]);
  checks.push({
    id: "servicio-installer",
    label: "Servicio Windows Installer (msiserver)",
    status: msiserver.ok ? "ok" : "aviso",
    value: msiserver.ok ? (msiserver.out.includes("RUNNING") ? "En ejecución" : "Detenido (arranque bajo demanda)") : "Desconocido",
    detail: "Windows lo inicia automáticamente al instalar un MSI; no necesitas permisos para ello.",
  });

  return checks;
}

function nonWindowsChecks(): DiagnosticCheck[] {
  return [
    {
      id: "plataforma",
      label: "Sistema operativo",
      status: "aviso",
      value: `${process.platform} (${os.release()})`,
      detail:
        "La instalación por-usuario de programas de Windows solo puede ejecutarse en Windows. Aquí la app funciona en modo simulación: detecta motores, construye el comando exacto y muestra el flujo completo, pero no instala nada.",
    },
    {
      id: "deteccion",
      label: "Detección de motores de instalación",
      status: "ok",
      value: "Operativa",
      detail:
        "El análisis de firmas y del manifiesto UAC funciona en cualquier sistema: puedes cargar un .exe o .msi y ver el motor y las banderas que se usarían.",
    },
    {
      id: "persistencia",
      label: "Historial y logs locales",
      status: "ok",
      value: "Operativo",
      detail: "Los trabajos y sus logs se guardan en la carpeta de datos del usuario de la aplicación.",
    },
  ];
}

export async function runDiagnostics(): Promise<Diagnostics> {
  const checks = IS_WINDOWS ? await windowsChecks() : nonWindowsChecks();
  return {
    platform: process.platform,
    supported: IS_WINDOWS,
    userName: os.userInfo().username,
    localAppData: process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
    programsDir: userProgramsDir(),
    checks,
    generatedAt: Date.now(),
  };
}
