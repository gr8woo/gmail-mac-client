import type { AppUpdateState } from "../shared/update";

export interface UpdaterPort {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowDowngrade: boolean;
  allowPrerelease: boolean;
  on(event: string, listener: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
}

export interface AutomaticUpdateDependencies {
  updater: UpdaterPort;
  currentVersion: string;
  ensureSupported(): Promise<void>;
  hasActiveWork(): boolean;
}

/** One main-process instance owns downloads and installation across renderer reloads. */
export class AutomaticUpdateService {
  private state: AppUpdateState;
  private operation: Promise<AppUpdateState> | null = null;
  private listeners = new Set<(state: AppUpdateState) => void>();
  private ready = false;
  private sawError = false;
  private installing = false;
  private installAttempted = false;

  constructor(private readonly deps: AutomaticUpdateDependencies) {
    this.state = { phase: "idle", currentVersion: deps.currentVersion };
    const updater = deps.updater;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    updater.on("update-available", (info: { version: string }) => {
      this.set({ phase: "available", latestVersion: info.version, message: "새 버전을 사용할 수 있습니다." });
    });
    updater.on("update-not-available", () => this.set({ phase: "current", message: "최신 버전입니다." }));
    updater.on("download-progress", (progress: { percent: number }) => {
      this.set({ ...this.state, phase: "downloading", percent: Math.max(0, Math.min(100, progress.percent)), message: "다운로드 중입니다. 완료 후 앱이 재시작됩니다." });
    });
    updater.on("error", (error: Error) => this.fail(error));
  }

  getState(): AppUpdateState { return { ...this.state }; }
  subscribe(listener: (state: AppUpdateState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  isInstalling(): boolean { return this.installAttempted; }

  check(): Promise<AppUpdateState> {
    if (this.operation) return this.operation;
    if (this.ready || this.installAttempted) return Promise.resolve(this.getState());
    return this.run(async () => {
      await this.deps.ensureSupported();
      this.sawError = false;
      this.set({ phase: "checking", message: "업데이트 확인 중…" });
      await this.deps.updater.checkForUpdates();
      if (this.state.phase === "checking") throw new Error("업데이트 정보를 확인하지 못했습니다. 다시 시도해주세요.");
    });
  }

  updateAndRestart(): Promise<AppUpdateState> {
    if (this.operation) return this.operation;
    if (this.installAttempted) return Promise.resolve(this.getState());
    return this.run(async () => {
      await this.deps.ensureSupported();
      if (this.deps.hasActiveWork()) {
        this.set({ ...this.state, message: "AI 작업이 진행 중입니다. 완료 후 업데이트 버튼을 다시 눌러주세요." });
        return;
      }
      this.sawError = false;
      if (!this.ready) {
        // Recheck after an error, but do not silently change a displayed available release.
        if (this.state.phase !== "available") {
          this.set({ phase: "checking", message: "업데이트 확인 중…" });
          await this.deps.updater.checkForUpdates();
          if (this.getState().phase !== "available" || this.sawError) return;
        }
        this.set({ ...this.state, phase: "downloading", percent: 0, message: "다운로드 후 앱을 자동으로 다시 시작합니다." });
        await this.deps.updater.downloadUpdate();
        if (this.sawError) return;
        this.ready = true;
      }
      if (this.deps.hasActiveWork()) {
        this.set({ ...this.state, phase: "ready", message: "다운로드 완료. AI 작업이 끝나면 업데이트 버튼을 눌러 재시작하세요." });
        return;
      }
      this.installAttempted = true;
      this.installing = true;
      this.set({ ...this.state, phase: "installing", message: "macOS 서명을 검증하고 업데이트를 적용합니다. 잠시 후 재시작됩니다." });
      // Squirrel.Mac verifies the signed app before replacing it. Do not bypass this.
      this.deps.updater.quitAndInstall();
    });
  }

  private run(action: () => Promise<void>): Promise<AppUpdateState> {
    this.operation = Promise.resolve().then(action).catch(error => this.fail(error)).then(() => this.getState()).finally(() => { this.operation = null; });
    return this.operation;
  }
  private fail(error: unknown): void {
    this.sawError = true;
    this.installing = false;
    this.ready = false;
    this.set({ phase: "error", message: `업데이트 실패: ${error instanceof Error ? error.message : String(error)}.${this.installAttempted ? " 앱을 다시 실행한 뒤 재시도해주세요." : " 다시 시도해주세요."} 기존 앱은 그대로 유지됩니다.` });
  }
  private set(next: Omit<AppUpdateState, "currentVersion">): void {
    this.state = { currentVersion: this.deps.currentVersion, ...next };
    for (const listener of this.listeners) listener(this.getState());
  }
}
