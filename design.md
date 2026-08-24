# Instalador Por-Usuario — Design

Aplicación de escritorio (Electron, Windows) que instala programas **en el perfil del usuario**, en
modo silencioso, **sin requerir permisos de administrador**. No elude ni vulnera controles del
sistema: únicamente utiliza los mecanismos de instalación por-usuario que Windows y cada motor de
instalación soportan de forma oficial (`MSIINSTALLPERUSER`, `/CURRENTUSER`, `winget --scope user`,
MSIX por usuario, extracción portable en `%LOCALAPPDATA%`). Cuando un instalador exige elevación,
la app lo detecta, lo informa con claridad y ofrece rutas alternativas.

Dirección visual: **consola técnica de grafito** — superficies casi negras, retícula sutil, un único
acento ámbar de señal, tipografía displáy condensada con logs monoespaciados. Densidad controlada,
cero decoración innecesaria: se lee como un instrumento, no como una landing.

## Brand & Colors

Tokens en `packages/web/src/web/styles.css` (el escritorio carga la UI web). Tema oscuro fijo —
es una herramienta de operación, no cambia con el sistema.

| Token | Valor | Uso |
|-------|-------|-----|
| background | #0A0B0D | Fondo de la app |
| surface | #12141A | Paneles, tarjetas |
| surface-2 | #1A1D25 | Filas, campos, hover |
| border | #262A35 | Hairlines |
| foreground | #F2F4F7 | Texto principal |
| muted | #8A93A5 | Texto secundario, etiquetas |
| accent (ámbar) | #FFB020 | Acción primaria, foco, progreso |
| success | #4ADE80 | Instalación correcta |
| warning | #FBBF24 | Requiere reinicio / parcial |
| danger | #F87171 | Fallo, requiere administrador |
| info | #60A5FA | Diagnóstico, detección |

## Typography

- **Display**: Bricolage Grotesque (títulos, cifras, encabezados de panel).
- **Body**: IBM Plex Sans (texto de interfaz, descripciones).
- **Mono**: IBM Plex Mono (rutas, banderas, códigos de salida, consola de log).

Cargadas desde Google Fonts en `styles.css`. Jerarquía por tamaño y peso, interlineado amplio en
texto de ayuda, apretado en tablas y logs.

## Pages & Screens

Shell de escritorio con barra de título propia (controles minimizar/maximizar/cerrar) y navegación
lateral fija.

- **Instalador** (`src/web/pages/index.tsx`) — zona de selección de instaladores, cola de trabajos
  con motor detectado, modo elegido y banderas exactas; consola de log en vivo por trabajo.
- **Catálogo winget** (`src/web/pages/catalogo.tsx`) — búsqueda en winget e instalación
  `--scope user` sin elevación.
- **Diagnóstico** (`src/web/pages/diagnostico.tsx`) — comprobaciones del equipo: elevación actual,
  escribibilidad de `%LOCALAPPDATA%\Programs`, políticas de Installer/AppLocker, disponibilidad de
  winget y PowerShell, espacio libre.
- **Historial** (`src/web/pages/historial.tsx`) — trabajos previos con resultado, código de salida,
  duración y ruta del log; exportable a JSON.
- **Ayuda** (`src/web/pages/ayuda.tsx`) — qué se puede y qué no sin admin, tabla de banderas por
  motor, interpretación de códigos de error, límites legales/técnicos.

## Key User Flows

1. **Instalar sin admin**: seleccionar/arrastrar `.msi`/`.exe`/`.msix`/`.zip` → la app husmea el
   binario y detecta el motor (MSI, Inno Setup, NSIS, InstallShield, Burn, Squirrel, MSIX, portable)
   → propone modo por-usuario y muestra la línea de comandos exacta → ejecutar → log en vivo →
   resultado interpretado y guardado en historial.
2. **Cuando exige elevación**: el motor devuelve 1925/1603/740 → la app lo explica y sugiere
   alternativas (winget user-scope, extracción portable, solicitar a TI).
3. **Portable**: `.zip` o instalador no soportado → extraer a `%LOCALAPPDATA%\Programs\<app>` y
   crear acceso directo en el menú Inicio del usuario.

## Architecture

- **Motor en el proceso principal de Electron** (`packages/desktop/electron/installer/`): detección,
  banderas, ejecución, diagnóstico, persistencia. Es la única capa capaz de lanzar procesos de
  Windows, y mantiene la app **100% funcional offline y empaquetada** (sin depender del servidor).
- **IPC** con streaming de log (`installer:log`, `installer:job`) → `window.electronAPI.installer`.
- **Persistencia**: JSON en `app.getPath("userData")` (`history.json`) + logs por trabajo en
  `userData/logs/`. Nada se escribe fuera del perfil del usuario.
- **UI**: React + Tailwind en `packages/web/src/web/`, gateada con `useDesktop()`; en navegador
  muestra aviso de que la ejecución requiere la app de escritorio.
