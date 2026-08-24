import { ipcRenderer, contextBridge, webUtils } from "electron";
import { createManagedAuthBridge } from "@runablehq/managed-auth/desktop/preload";

/** Ruta real de un archivo arrastrado a la ventana. */
function pathForFile(file: File): string {
  try {
    return webUtils?.getPathForFile ? webUtils.getPathForFile(file) : ((file as unknown as { path?: string }).path ?? "");
  } catch {
    return (file as unknown as { path?: string }).path ?? "";
  }
}

/** Suscripción tipada a un canal de eventos del motor de instalación. */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const installer = {
  env: () => ipcRenderer.invoke("installer:env"),
  pick: () => ipcRenderer.invoke("installer:pick"),
  detect: (paths: string[]) => ipcRenderer.invoke("installer:detect", paths),
  defaultTarget: (fileName: string) => ipcRenderer.invoke("installer:default-target", fileName),
  chooseTarget: (suggested?: string) => ipcRenderer.invoke("installer:choose-target", suggested),
  plan: (request: unknown) => ipcRenderer.invoke("installer:plan", request),
  run: (request: unknown) => ipcRenderer.invoke("installer:run", request),
  cancel: (jobId: string) => ipcRenderer.invoke("installer:cancel", jobId),
  history: () => ipcRenderer.invoke("installer:history"),
  clearHistory: () => ipcRenderer.invoke("installer:history-clear"),
  exportHistory: () => ipcRenderer.invoke("installer:history-export"),
  readLog: (logPath: string) => ipcRenderer.invoke("installer:read-log", logPath),
  diagnostics: () => ipcRenderer.invoke("installer:diagnostics"),
  wingetSearch: (query: string) => ipcRenderer.invoke("installer:winget-search", query),
  openPath: (target: string) => ipcRenderer.invoke("installer:open-path", target),
  reveal: (target: string) => ipcRenderer.invoke("installer:reveal", target),
  pathForFile,
  onLog: (cb: (line: unknown) => void) => subscribe("installer:log", cb),
  onJob: (cb: (job: unknown) => void) => subscribe("installer:job", cb),
};

// window.managedAuth — { openExternal, onDeepLink, getRedirectTarget }, backed by
// the IPC surface createManagedDeepLinks registers in main.ts. Managed sign-in
// reads this key; keep it (`bun run lint` enforces the import).
const managedAuth = createManagedAuthBridge();
contextBridge.exposeInMainWorld("managedAuth", managedAuth);

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,

  // Dialog
  showOpenDialog: (opts: Electron.OpenDialogOptions) =>
    ipcRenderer.invoke("dialog:open", opts),
  showSaveDialog: (opts: Electron.SaveDialogOptions) =>
    ipcRenderer.invoke("dialog:save", opts),

  // File system
  readFile: (path: string) => ipcRenderer.invoke("fs:read", path),
  writeFile: (path: string, data: string) =>
    ipcRenderer.invoke("fs:write", path, data),

  // Shell — opens in the user's default browser, http(s) only (enforced in the main process)
  openExternal: managedAuth.openExternal,

  // Notifications
  showNotification: (title: string, body: string) =>
    ipcRenderer.invoke("notification:show", title, body),

  // Window controls
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  close: () => ipcRenderer.invoke("window:close"),

  // OS deep links on the app's runable-<APPLICATION_ID> scheme (same stream managed auth uses)
  onDeepLink: managedAuth.onDeepLink,

  // Motor de instalación por-usuario
  installer,
});
