import { BrowserWindow } from "electron";
import { join } from "node:path";

const devServerUrl = process.env.VITE_DEV_SERVER_URL;

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
      sandbox: false
    }
  });

  if (devServerUrl) {
    await window.loadURL(devServerUrl);
  } else {
    await window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}
