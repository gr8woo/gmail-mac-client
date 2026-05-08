import { app, BrowserWindow } from "electron";
import { join } from "node:path";

const allowedDevServerOrigin = "http://127.0.0.1:5173";

export async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    title: "Gmail Mac Client",
    webPreferences: {
      preload: join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const devServerUrl = getDevServerUrl();

  if (devServerUrl) {
    await window.loadURL(devServerUrl.href);
  } else {
    await window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}

function getDevServerUrl(): URL | null {
  if (app.isPackaged) {
    return null;
  }

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (!devServerUrl) {
    return null;
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(devServerUrl);
  } catch {
    throw new Error(`Invalid VITE_DEV_SERVER_URL: expected ${allowedDevServerOrigin}`);
  }

  if (parsedUrl.origin !== allowedDevServerOrigin) {
    throw new Error(`Invalid VITE_DEV_SERVER_URL origin: expected ${allowedDevServerOrigin}`);
  }

  return parsedUrl;
}
