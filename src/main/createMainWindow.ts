import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createDefaultProfileStore, registerProfileIpc } from "./ipc";
import { GmailViewController } from "./gmailViewController";

const allowedDevServerOrigin = "http://127.0.0.1:5173";

export async function createMainWindow(): Promise<BrowserWindow> {
  const store = createDefaultProfileStore();

  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    title: "Simple Gmail Client",
    webPreferences: {
      preload: join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const gmailViewController = new GmailViewController(window, store, {
    onProfileMetadata: (profileId, metadata) => {
      const profile = store.getState().profiles.find((candidate) => candidate.id === profileId);

      if (!profile || (profile.email === metadata.email && profile.avatarUrl === metadata.avatarUrl)) {
        return;
      }

      store.updateProfileMetadata(profileId, metadata);
      window.webContents.send("profiles:changed");
    }
  });
  gmailViewController.attach();
  registerProfileIpc(store, gmailViewController);

  protectShellNavigation(window);

  const devServerUrl = getDevServerUrl();

  if (devServerUrl) {
    await window.loadURL(devServerUrl.href);
  } else {
    await window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  const lastActiveSurface = store.getState().lastActiveSurface;
  if (lastActiveSurface) {
    await gmailViewController.switchToSurface(lastActiveSurface);
  }

  const lastActiveProfileId = store.getState().lastActiveProfileId;
  if (!lastActiveSurface && lastActiveProfileId) {
    await gmailViewController.switchToProfile(lastActiveProfileId);
  }

  return window;
}

function protectShellNavigation(window: BrowserWindow): void {
  window.webContents.on("will-navigate", (event, url) => {
    if (isTrustedShellUrl(url)) {
      return;
    }

    event.preventDefault();
    openExternalHttpUrl(url);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalHttpUrl(url);
    return { action: "deny" };
  });
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

function isTrustedShellUrl(url: string): boolean {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    return false;
  }

  if (!app.isPackaged && parsedUrl.origin === allowedDevServerOrigin) {
    return true;
  }

  return parsedUrl.href === getRendererIndexUrl().href;
}

function getRendererIndexUrl(): URL {
  return pathToFileURL(join(__dirname, "../renderer/index.html"));
}

function openExternalHttpUrl(url: string): void {
  if (!isSafeExternalUrl(url)) {
    return;
  }

  void shell.openExternal(url);
}

function isSafeExternalUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}
