import { app, BrowserWindow } from "electron";
import { applyDockIcon } from "./appIcon";
import { createMainWindow } from "./createMainWindow";
import { configureMacWebAuthn } from "./webAuthn";

app.setName("Simple Gmail Client");
configureMacWebAuthn(app);

async function ensureWindow(): Promise<BrowserWindow> {
  const existing = BrowserWindow.getAllWindows()[0];

  if (existing) {
    existing.show();
    return existing;
  }

  return createMainWindow();
}

app.whenReady().then(async () => {
  applyDockIcon();
  await ensureWindow();

  app.on("activate", async () => {
    await ensureWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || process.env.GMAIL_CLIENT_E2E === "1") {
    app.quit();
  }
});
