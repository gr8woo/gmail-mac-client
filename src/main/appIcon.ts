import { app, nativeImage } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function getRuntimeAppIconPath(mainDir = __dirname): string {
  return join(mainDir, "../../build/icon.png");
}

export function applyDockIcon(): void {
  if (process.platform !== "darwin" || !app.dock) {
    return;
  }

  const iconPath = getRuntimeAppIconPath();

  if (!existsSync(iconPath)) {
    return;
  }

  app.dock.setIcon(nativeImage.createFromPath(iconPath));
}
