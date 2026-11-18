export interface AvailableUpdate {
  available: true;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  assetName: string;
  downloadUrl: string;
  publishedAt: string;
  size?: number | undefined;
  sha256?: string | undefined;
}

export interface NoUpdate {
  available: false;
  currentVersion: string;
  latestVersion?: string;
}

export type UpdateCheckResult = AvailableUpdate | NoUpdate;

export interface UpdateDownloadResult {
  downloadedPath: string;
  update: AvailableUpdate;
}

export interface AppUpdateState {
  phase: "idle" | "checking" | "current" | "available" | "downloading" | "ready" | "installing" | "error";
  currentVersion: string;
  latestVersion?: string;
  percent?: number;
  message?: string;
}
