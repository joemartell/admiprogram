import { AlertTriangle, CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { PageHeader } from "../components/page-header";

const SI_SE_PUEDE = [
  "Instaladores MSI que soportan instalación por-usuario (MSIINSTALLPERUSER=1 ALLUSERS=2).",
  "Instaladores Inno Setup con /CURRENTUSER, muy comunes en software libre.",
  "Instaladores NSIS que aceptan /CurrentUser y un directorio /D= dentro de tu perfil.",
  "Paquetes MSIX/AppX con Add-AppxPackage: el formato de Microsoft es por-usuario por diseño.",
  "Instaladores Squirrel (.exe de apps Electron): se instalan en %LOCALAPPDATA% sin preguntar.",
  "Programas portables en .zip: se extraen a %LOCALAPPDATA%\\Programs con acceso directo en tu menú Inicio.",
  "Paquetes de winget publicados con ámbito de usuario (winget install --scope user).",
];

const NO_SE_PUEDE = [
  "Instalar controladores de dispositivo, filtros de red o cualquier cosa en modo kernel.",
  "Registrar servicios de Windows o tareas programadas del sistema.",
  "Escribir en C:\\Program Files, C:\\Windows o en HKEY_LOCAL_MACHINE.",
  "Instalar runtimes compartidos de máquina (algunos Visual C++ Redistributable, .NET del sistema).",
  "Saltarse una directiva de grupo que prohíbe instalaciones (DisableUserInstalls, DisableMSI, AppLocker).",
  "Instalar un paquete cuyo manifiesto declara requireAdministrator: Windows exigirá elevación siempre.",
];

const BANDERAS = [
  {
    motor: "MSI (msiexec)",
    comando: 'msiexec /i "paquete.msi" /qn MSIINSTALLPERUSER=1 ALLUSERS=2 /norestart /l*v "log.txt"',
    nota: "MSIINSTALLPERUSER=1 con ALLUSERS=2 fuerza el contexto por-usuario. Solo funciona si el paquete fue creado con InstallScope perUser o dual.",
  },
  {
    motor: "Inno Setup",
    comando: 'setup.exe /VERYSILENT /SUPPRESSMSGBOXES /CURRENTUSER /NORESTART /DIR="ruta" /LOG="log.txt"',
    nota: "/CURRENTUSER selecciona el modo no administrativo. Requiere que el script use PrivilegesRequired=lowest o dual.",
  },
  {
    motor: "NSIS",
    comando: "setup.exe /S /CurrentUser /D=C:\\Users\\tu-usuario\\AppData\\Local\\Programs\\App",
    nota: "/D= debe ser el ÚLTIMO argumento, sin comillas y con ruta absoluta. Es una regla del propio NSIS, no una decisión de esta app.",
  },
  {
    motor: "InstallShield",
    comando: 'setup.exe /s /v"/qn MSIINSTALLPERUSER=1 ALLUSERS=2 /norestart"',
    nota: "/s silencia el envoltorio y /v pasa los argumentos al msiexec interno.",
  },
  {
    motor: "Burn (WiX bundle)",
    comando: "bundle.exe /quiet /norestart /log log.txt",
    nota: "El bundle decide el contexto según su manifiesto; si trae paquetes de máquina pedirá elevación.",
  },
  {
    motor: "Squirrel",
    comando: "Setup.exe --silent",
    nota: "Siempre instala en %LOCALAPPDATA%; es el patrón de las apps Electron.",
  },
  {
    motor: "MSIX / AppX",
    comando: "powershell -NoProfile -Command Add-AppxPackage -Path 'paquete.msix'",
    nota: "Formato moderno de Microsoft, por-usuario por definición. Requiere que el paquete esté firmado y el certificado sea de confianza.",
  },
  {
    motor: "Portable (.zip)",
    comando: "Expand-Archive -Path 'app.zip' -DestinationPath '%LOCALAPPDATA%\\Programs\\App'",
    nota: "La opción que nunca falla: no toca el registro ni rutas protegidas.",
  },
  {
    motor: "winget",
    comando: "winget install --id Editor.App --scope user --silent --accept-package-agreements",
    nota: "La vía oficial de Microsoft sin elevación. Si el paquete solo existe en ámbito de máquina, winget lo dirá.",
  },
];

const CODIGOS = [
  { codigo: "0", significado: "Instalación completada correctamente." },
  { codigo: "1602", significado: "Cancelada por el usuario o por el propio instalador." },
  {
    codigo: "1603",
    significado:
      "Error irrecuperable. Sin administrador casi siempre significa escritura en ruta protegida o intento de crear un servicio.",
  },
  { codigo: "1618", significado: "Otra instalación en curso: espera y reintenta (Windows Installer es de uno en uno)." },
  { codigo: "1619 / 1620", significado: "El paquete no se pudo abrir o no es un MSI válido." },
  { codigo: "1625", significado: "Prohibido por directiva de grupo (DisableUserInstalls / DisableMSI)." },
  { codigo: "1730 / 1925", significado: "El paquete exige privilegios de administrador para el contexto solicitado." },
  { codigo: "3010", significado: "Instalado, pero pendiente de reinicio para completar." },
  { codigo: "740", significado: "El ejecutable requiere elevación (requireAdministrator en su manifiesto)." },
  { codigo: "1223", significado: "El diálogo de UAC se cerró o se rechazó." },
  { codigo: "1260", significado: "Bloqueado por AppLocker o por directivas de restricción de software." },
];

function Ayuda() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-7">
      <PageHeader
        eyebrow="cómo funciona y qué límites tiene"
        title="Ayuda y alcance real"
        description="Esta aplicación usa únicamente los mecanismos oficiales de instalación por-usuario que Windows ofrece. No elude UAC ni las directivas de tu organización: cuando algo exige administrador, te lo dice y propone alternativas legítimas."
      />

      <div className="panel border-accent/30 bg-accent-soft/40 p-4">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-accent" />
          <div>
            <p className="text-[14px] font-semibold">Sin bypass de UAC, por diseño</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Todo lo que se instala queda dentro de tu perfil ({"%LOCALAPPDATA%"}) y de tu rama del registro
              (HKEY_CURRENT_USER). Si un instalador declara que necesita administrador, la app no lo ejecuta: te lo
              informa y te ofrece un camino alterno. Esa es la diferencia entre una instalación por-usuario legítima y
              una elevación forzada.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="panel p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-success" />
            <p className="font-display text-[15px] font-bold">Qué sí se puede instalar</p>
          </div>
          <ul className="mt-3 space-y-2">
            {SI_SE_PUEDE.map((item) => (
              <li key={item} className="flex gap-2 text-[12px] leading-relaxed text-muted">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-success" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-4">
          <div className="flex items-center gap-2">
            <XCircle className="size-4 text-danger" />
            <p className="font-display text-[15px] font-bold">Qué no se puede, ni con trucos</p>
          </div>
          <ul className="mt-3 space-y-2">
            {NO_SE_PUEDE.map((item) => (
              <li key={item} className="flex gap-2 text-[12px] leading-relaxed text-muted">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-danger" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <p className="font-display text-[15px] font-bold">Banderas por motor de instalación</p>
          <p className="mt-0.5 text-[12px] text-muted">
            La app detecta el motor leyendo la firma del binario y aplica exactamente estas banderas.
          </p>
        </div>
        <div className="divide-y divide-border">
          {BANDERAS.map((row) => (
            <div key={row.motor} className="p-4">
              <p className="text-[13px] font-semibold text-accent">{row.motor}</p>
              <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-[#080909] p-2.5 font-mono text-[11px] text-foreground/85">
                {row.comando}
              </pre>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">{row.nota}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <p className="font-display text-[15px] font-bold">Códigos de salida frecuentes</p>
        </div>
        <div className="divide-y divide-border">
          {CODIGOS.map((row) => (
            <div key={row.codigo} className="flex gap-4 px-4 py-2.5">
              <p className="w-24 shrink-0 font-mono text-[12px] text-accent">{row.codigo}</p>
              <p className="text-[12px] leading-relaxed text-muted">{row.significado}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="panel p-4">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="text-[14px] font-semibold">Cuando nada funciona</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Si el programa realmente necesita cambios en el sistema, el camino correcto es pedirlo a tu área de TI con
              el nombre y versión exactos. Exporta el historial desde la pestaña Historial: incluye el comando probado y
              el código de error, lo que suele acelerar la autorización.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Ayuda;
