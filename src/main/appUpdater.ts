import { app, autoUpdater as nativeUpdater } from "electron";
import { autoUpdater } from "electron-updater";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { stageVerifiedNativeInstall } from "./nativeUpdateInstaller";
import { AutomaticUpdateService } from "./automaticUpdateService";

let activeWork = 0;
let service: AutomaticUpdateService | undefined;
const exec = promisify(execFile);
let validation: Promise<void> | undefined;

async function ensureProductionBuild(): Promise<void> {
  if (!app.isPackaged || process.mas || process.platform !== "darwin" || process.env.GMAIL_CLIENT_E2E === "1") {
    throw new Error("자동 업데이트는 서명된 정식 macOS 배포 앱에서만 사용할 수 있습니다.");
  }
  if (!validation) {
    validation = (async () => {
      const bundle = resolve(dirname(process.execPath), "../..");
      const info = await exec("/usr/bin/codesign", ["-dv", "--verbose=2", bundle]);
      if (!/^Identifier=com\.gr8woo\.simplegmailclient$/m.test(info.stderr) ||
          !/^Authority=Developer ID Application:/m.test(info.stderr)) {
        throw new Error("미리보기 또는 서명되지 않은 앱은 정식 업데이트를 설치할 수 없습니다.");
      }
      await exec("/usr/bin/codesign", ["--verify", "--deep", "--strict", bundle]);
    })().catch(error => { validation = undefined; throw error; });
  }
  return validation;
}

export function getAppUpdater(): AutomaticUpdateService {
  if (!service) {
    autoUpdater.autoRunAppAfterInstall = true;
    autoUpdater.requestHeaders = { "Cache-Control": "no-cache" };
    service = new AutomaticUpdateService({
      updater: {
        get autoDownload() { return autoUpdater.autoDownload; },
        set autoDownload(value) { autoUpdater.autoDownload = value; },
        get autoInstallOnAppQuit() { return autoUpdater.autoInstallOnAppQuit; },
        set autoInstallOnAppQuit(value) { autoUpdater.autoInstallOnAppQuit = value; },
        get allowDowngrade() { return autoUpdater.allowDowngrade; },
        set allowDowngrade(value) { autoUpdater.allowDowngrade = value; },
        get allowPrerelease() { return autoUpdater.allowPrerelease; },
        set allowPrerelease(value) { autoUpdater.allowPrerelease = value; },
        on: (event, listener) => autoUpdater.on(event as any, listener),
        checkForUpdates: () => autoUpdater.checkForUpdates(),
        downloadUpdate: () => autoUpdater.downloadUpdate(),
        quitAndInstall: () => stageVerifiedNativeInstall(nativeUpdater)
      },
      currentVersion: app.getVersion(),
      ensureSupported: ensureProductionBuild,
      hasActiveWork: () => activeWork > 0
    });
  }
  return service;
}

export async function withActiveAgentWork<T>(action: () => Promise<T>): Promise<T> {
  if (getAppUpdater().isInstalling()) throw new Error("업데이트 적용 중입니다. 재시작 후 다시 시도해주세요.");
  activeWork++;
  try { return await action(); } finally { activeWork--; }
}
