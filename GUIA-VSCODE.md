# Guía rápida — Instalador Por-Usuario en VS Code

## Requisitos

1. **Bun** (runtime y gestor de paquetes):
   - Windows (PowerShell): `powershell -c "irm bun.sh/install.ps1 | iex"`
   - Linux/macOS: `curl -fsSL https://bun.sh/install | bash`
2. **VS Code**: https://code.visualstudio.com
3. Extensiones recomendadas: VS Code las ofrecerá automáticamente al abrir la carpeta (`.vscode/extensions.json`).

## Puesta en marcha

```bash
cd instalador-por-usuario
bun install
```

Luego, en VS Code: **Terminal → Run Task…** y ejecuta en este orden:

1. **`1. Web (Vite, puerto 4400)`** — levanta la interfaz web en http://localhost:4400
2. **`2. Escritorio (Electron)`** — abre la ventana de la app cargando esa interfaz

O desde la terminal, en dos consolas:

```bash
bun run dev --port 4400        # consola 1: web
bun run dev:desktop            # consola 2: Electron (usa WEBSITE_URL=http://localhost:4400 por defecto en las tareas)
```

## Generar el instalador .exe (en Windows)

```bash
bun run --cwd packages/desktop dist
```

El resultado queda en `packages/desktop/release/0.0.0/` como
`Instalador Por-Usuario-Windows-0.0.0-Setup.exe` (NSIS, instalación por-usuario, sin admin).

## Notas

- **Desarrollo en Linux/macOS**: las instalaciones se *simulan* (marcadas `simulated: true`); la ejecución real de instaladores solo ocurre en Windows.
- El historial y los logs se guardan en el perfil del usuario de la máquina (`app.getPath("userData")`), nunca fuera de él.
- Si clonaste el repo y no hay `.env`, copia `.env.template` a `.env` y usa `DATABASE_URL=file:local.db` (SQLite en archivo) para arrancar sin credenciales externas. La app del instalador no usa la base de datos: su historial va en JSON del perfil del usuario.
- Si cambias el puerto web, ajusta `WEBSITE_URL` en `.vscode/tasks.json` y `launch.json` para que Electron cargue la dirección correcta.
