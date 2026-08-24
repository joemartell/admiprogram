import { app, BrowserWindow, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createManagedDeepLinks } from "@runablehq/managed-auth/desktop/main";
import { registerIpcHandlers } from "./ipc";
import { registerInstallerIpc } from "./installer/ipc";

// Fully editable Electron main process — own the window, lifecycle, menus, tray,
// and IPC (starter handlers in ./ipc.ts). One platform call is enforced by
// `bun run lint`: createManagedDeepLinks. It registers the app's
// runable-<APPLICATION_ID> deep-link protocol, forwards deep links to the
// renderer, and backs managed sign-in (skills/app/references/desktop.md).

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = process.env.NODE_ENV !== "production";
const WEB_DEV_URL = process.env.WEBSITE_URL ?? "http://localhost:3000";
const WEB_DIST = path.join(__dirname, "../web-dist");
const DEV_LOAD_RETRY_DELAY_MS = 250;
const DEV_LOAD_MAX_ATTEMPTS = 40;

let win: BrowserWindow | null = null;
const getWindow = () => win;

const deepLinks = createManagedDeepLinks({
  applicationId: process.env.APPLICATION_ID,
  getWindow,
});

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadDevelopmentUrl() {
  for (let attempt = 1; attempt <= DEV_LOAD_MAX_ATTEMPTS; attempt += 1) {
    if (!win || win.isDestroyed()) return;

    try {
      await win.loadURL(WEB_DEV_URL);
      return;
    } catch (error) {
      if (attempt === DEV_LOAD_MAX_ATTEMPTS) {
        console.error(`Unable to load the development web app at ${WEB_DEV_URL}`, error);
        return;
      }

      await delay(DEV_LOAD_RETRY_DELAY_MS);
    }
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#0A0B0D",
    autoHideMenuBar: true,
    title: "Instalador Por-Usuario",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    void loadDevelopmentUrl();
  } else {
    win.loadFile(path.join(WEB_DIST, "index.html"));
  }
}

Menu.setApplicationMenu(null);

registerIpcHandlers(getWindow);
registerInstallerIpc(getWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Windows/Linux deliver deep links as argv — of a second instance while the app
// is running, of this instance on cold start. Keep one instance and forward both.
if (app.requestSingleInstanceLock()) {
  app.on("second-instance", (_event, argv) => deepLinks.handleArgv(argv));
  app.whenReady().then(() => {
    createWindow();
    deepLinks.handleArgv(process.argv);
  });
} else {
  app.quit();
}
