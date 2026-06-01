export interface AvailableUpdate {
  available: true;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  assetName: string;
  downloadUrl: string;
  publishedAt: string;
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
