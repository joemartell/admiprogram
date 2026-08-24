/**
 * Puente IPC del motor de instalación: todo lo que la interfaz puede pedir.
 */
import { ipcMain, dialog, shell, app, type BrowserWindow } from "electron";
import os from "node:os";
import path from "node:path";
import { detectMany } from "./detect";
import { runDiagnostics } from "./diagnostics";
import { defaultTargetDir, userProgramsDir } from "./plan";
import { cancelJob, IS_WINDOWS, previewPlan, runInstall } from "./runner";
import { clearHistory, exportHistory, logsDir, readHistory, readLogFile } from "./store";
import { searchWinget } from "./winget";
import type { RunRequest } from "./types";

const INSTALLER_FILTERS = [
  {
    name: "Instaladores y paquetes",
    extensions: ["msi", "exe", "msix", "appx", "msixbundle", "appxbundle", "zip", "msu", "cab"],
  },
  { name: "Todos los archivos", extensions: ["*"] },
];

export function registerInstallerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle("installer:env", () => ({
    platform: process.platform,
    supported: IS_WINDOWS,
    userName: os.userInfo().username,
    computerName: process.env.COMPUTERNAME ?? os.hostname(),
    programsDir: userProgramsDir(),
    logsDir: logsDir(),
    dataDir: app.getPath("userData"),
    appVersion: app.getVersion(),
  }));

  ipcMain.handle("installer:pick", async () => {
    const win = getWindow();
    if (!win) return [];
    const result = await dialog.showOpenDialog(win, {
      title: "Selecciona los instaladores",
      buttonLabel: "Agregar a la cola",
      filters: INSTALLER_FILTERS,
      // multiSelections permite cargar varios instaladores de una vez
      properties: ["openFile", "multiSelections", "dontAddToRecent"],
    });
    if (result.canceled || result.filePaths.length === 0) return [];
    return detectMany(result.filePaths);
  });

  ipcMain.handle("installer:detect", (_event, paths: string[]) => detectMany(paths));

  ipcMain.handle("installer:default-target", (_event, fileName: string) => defaultTargetDir(fileName));

  ipcMain.handle("installer:choose-target", async (_event, suggested?: string) => {
    const win = getWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      title: "Carpeta destino (dentro de tu perfil de usuario)",
      defaultPath: suggested ?? userProgramsDir(),
      properties: ["openDirectory", "createDirectory"],
      buttonLabel: "Usar esta carpeta",
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle("installer:plan", (_event, request: RunRequest) => previewPlan(request));

  ipcMain.handle("installer:run", (_event, request: RunRequest) => runInstall(request));

  ipcMain.handle("installer:cancel", (_event, jobId: string) => cancelJob(jobId));

  ipcMain.handle("installer:history", () => readHistory());

  ipcMain.handle("installer:history-clear", () => clearHistory());

  ipcMain.handle("installer:history-export", async () => {
    const win = getWindow();
    const stamp = new Date().toISOString().slice(0, 10);
    const result = win
      ? await dialog.showSaveDialog(win, {
          title: "Exportar historial",
          defaultPath: path.join(app.getPath("documents"), `historial-instalaciones-${stamp}.json`),
          filters: [{ name: "JSON", extensions: ["json"] }],
        })
      : { canceled: true, filePath: undefined };
    if (result.canceled || !result.filePath) return null;
    return exportHistory(result.filePath);
  });

  ipcMain.handle("installer:read-log", async (_event, logPath: string) => {
    try {
      return await readLogFile(logPath);
    } catch (error) {
      return `No se pudo leer el log: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  ipcMain.handle("installer:diagnostics", () => runDiagnostics());

  ipcMain.handle("installer:winget-search", (_event, query: string) => searchWinget(query));

  ipcMain.handle("installer:open-path", async (_event, target: string) => {
    const error = await shell.openPath(target);
    return error || null;
  });

  ipcMain.handle("installer:reveal", (_event, target: string) => {
    shell.showItemInFolder(target);
  });
}
