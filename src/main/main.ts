import { app, BrowserWindow } from "electron";
import { createMainWindow } from "./createMainWindow";

app.setName("Gmail Mac Client");

async function ensureWindow(): Promise<BrowserWindow> {
  const existing = BrowserWindow.getAllWindows()[0];

  if (existing) {
    existing.show();
    return existing;
  }

  return createMainWindow();
}

app.whenReady().then(async () => {
  await ensureWindow();

  app.on("activate", async () => {
    await ensureWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
