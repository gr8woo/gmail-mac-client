import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import type { AvailableUpdate, UpdateCheckResult, UpdateDownloadResult } from "../shared/update";

const defaultRepository = "gr8woo/gmail-mac-client";
export type { AvailableUpdate, UpdateCheckResult, UpdateDownloadResult };

export interface UpdateServiceDependencies {
  currentVersion(): string;
  fetch(input: string, init?: RequestInit): Promise<Response>;
  getDownloadDirectory(): string;
  openPath(path: string): Promise<string>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  repository?: string;
  architecture?: string;
}

interface GitHubRelease {
  tag_name?: unknown;
  html_url?: unknown;
  published_at?: unknown;
  assets?: unknown;
}

interface GitHubAsset {
  name?: unknown;
  browser_download_url?: unknown;
  content_type?: unknown;
  size?: unknown;
  digest?: unknown;
}

export async function checkForUpdate(deps: UpdateServiceDependencies): Promise<UpdateCheckResult> {
  const currentVersion = deps.currentVersion();
  const repository = deps.repository ?? defaultRepository;
  const response = await request(deps, `https://api.github.com/repos/${repository}/releases/latest`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Simple-Gmail-Client"
    }
  });

  if (!response.ok) {
    if (isGitHubRateLimit(response)) {
      return checkForUpdateFromReleaseRedirect(deps, repository, currentVersion);
    }

    throw new Error(`Unable to check for updates: ${response.status}`);
  }

  const release = (await response.json()) as GitHubRelease;
  const latestVersion = normalizeVersion(readString(release.tag_name));

  if (!latestVersion) {
    throw new Error("Latest release is missing a version tag");
  }

  if (compareVersions(latestVersion, currentVersion) <= 0) {
    return {
      available: false,
      currentVersion,
      latestVersion
    };
  }

  const asset = findMacDmg(release.assets, deps.architecture ?? process.arch);
  if (!asset) {
    throw new Error(`Release ${latestVersion} does not include a compatible macOS DMG`);
  }

  return {
    available: true,
    currentVersion,
    latestVersion,
    releaseUrl: readString(release.html_url),
    assetName: readString(asset.name),
    downloadUrl: readString(asset.browser_download_url),
    publishedAt: readString(release.published_at),
    size: typeof asset.size === "number" ? asset.size : undefined,
    sha256: /^sha256:[a-f0-9]{64}$/i.test(readString(asset.digest)) ? readString(asset.digest).slice(7) : undefined
  };
}

async function checkForUpdateFromReleaseRedirect(
  deps: UpdateServiceDependencies,
  repository: string,
  currentVersion: string
): Promise<UpdateCheckResult> {
  const response = await request(deps, `https://github.com/${repository}/releases/latest`, {
    method: "HEAD",
    redirect: "manual"
  });

  const location = response.headers.get("location") ?? response.url;
  const tag = readLatestTagFromReleaseUrl(location);
  const latestVersion = normalizeVersion(tag);

  if (!latestVersion) {
    throw new Error("Latest release is missing a version tag");
  }

  if (compareVersions(latestVersion, currentVersion) <= 0) {
    return {
      available: false,
      currentVersion,
      latestVersion
    };
  }

  // The redirect reveals a version, not its asset names. Never fabricate a download URL.
  throw new Error(`GitHub update checks are temporarily rate limited. Retry later or open https://github.com/${repository}/releases/tag/${tag}`);
}

export async function downloadAndOpenUpdate(deps: UpdateServiceDependencies): Promise<UpdateDownloadResult> {
  const update = await checkForUpdate(deps);

  if (!update.available) {
    throw new Error("No update is available");
  }

  const repository = deps.repository ?? defaultRepository;
  const url = new URL(update.downloadUrl);
  if (url.protocol !== "https:" || url.hostname !== "github.com" ||
      !url.pathname.startsWith(`/${repository}/releases/download/`)) {
    throw new Error("Update download URL is not from the configured repository");
  }
  if (!update.sha256) {
    throw new Error("This release has no SHA-256 digest. Download it manually from GitHub and verify its macOS signature.");
  }
  const response = await request(deps, update.downloadUrl, {}, 300_000);
  if (!response.ok) {
    throw new Error(`Unable to download update: ${response.status}`);
  }

  const data = new Uint8Array(await response.arrayBuffer());
  if (!data.length || (update.size !== undefined && data.length !== update.size)) {
    throw new Error("Update download is empty or incomplete. Please retry.");
  }
  if (update.sha256 && createHash("sha256").update(data).digest("hex") !== update.sha256.toLowerCase()) {
    throw new Error("Update checksum verification failed. The installer was not opened.");
  }
  const downloadedPath = join(deps.getDownloadDirectory(), safeDownloadName(update.assetName));
  await deps.writeFile(downloadedPath, data);

  const openError = await deps.openPath(downloadedPath);
  if (openError) {
    throw new Error(openError);
  }

  return { downloadedPath, update };
}

export function compareVersions(left: string, right: string): -1 | 0 | 1 {
  const leftParts = normalizeVersion(left).split(".").map(readVersionNumber);
  const rightParts = normalizeVersion(right).split(".").map(readVersionNumber);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue > rightValue) {
      return 1;
    }

    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

function findMacDmg(rawAssets: unknown, architecture: string): GitHubAsset | null {
  if (!Array.isArray(rawAssets)) {
    return null;
  }

  return (
    rawAssets.find((rawAsset): rawAsset is GitHubAsset => {
      if (!rawAsset || typeof rawAsset !== "object") {
        return false;
      }

      const asset = rawAsset as GitHubAsset;
      const name = readString(asset.name).toLowerCase();
      const downloadUrl = readString(asset.browser_download_url);
      return name.endsWith(".dmg") && (name.includes(architecture) || name.includes("universal")) && Boolean(downloadUrl);
    }) ?? null
  );
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/iu, "");
}

function isGitHubRateLimit(response: Response): boolean {
  return response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0";
}

function readLatestTagFromReleaseUrl(url: string): string {
  return /\/releases\/tag\/([^/?#]+)/iu.exec(url)?.[1] ?? "";
}

function readVersionNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeDownloadName(assetName: string): string {
  const name = basename(assetName);
  return name.endsWith(".dmg") ? name : "Simple-Gmail-Client-update.dmg";
}

async function request(deps: UpdateServiceDependencies, url: string, init: RequestInit = {}, timeout = 15_000): Promise<Response> {
  try {
    return await deps.fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
  } catch (error) {
    if (error && typeof error === "object" && "name" in error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("Update request timed out. Check your connection and retry.");
    }
    throw error;
  }
}
