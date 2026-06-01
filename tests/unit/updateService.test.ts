import { describe, expect, it, vi } from "vitest";
import {
  checkForUpdate,
  compareVersions,
  downloadAndOpenUpdate,
  type UpdateServiceDependencies
} from "../../src/main/updateService";

function createDeps(overrides: Partial<UpdateServiceDependencies> = {}): UpdateServiceDependencies {
  return {
    currentVersion: () => "0.1.1",
    fetch: vi.fn(),
    getDownloadDirectory: () => "/Users/test/Downloads",
    openPath: vi.fn(async () => ""),
    writeFile: vi.fn(async () => undefined),
    ...overrides
  };
}

function githubRelease(version: string, assets = [githubDmgAsset(version)]) {
  return {
    tag_name: `v${version}`,
    html_url: `https://github.com/gr8woo/gmail-mac-client/releases/tag/v${version}`,
    published_at: "2026-06-01T02:14:49Z",
    assets
  };
}

function githubDmgAsset(version: string) {
  return {
    name: `Simple.Gmail.Client-${version}-arm64.dmg`,
    browser_download_url: `https://github.com/gr8woo/gmail-mac-client/releases/download/v${version}/Simple.Gmail.Client-${version}-arm64.dmg`,
    content_type: "application/x-apple-diskimage",
    size: 241986547
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function rateLimitResponse(): Response {
  return new Response(
    JSON.stringify({
      message: "API rate limit exceeded"
    }),
    {
      status: 403,
      headers: {
        "content-type": "application/json",
        "x-ratelimit-remaining": "0"
      }
    }
  );
}

describe("compareVersions", () => {
  it("orders semantic versions with an optional v prefix", () => {
    expect(compareVersions("v0.1.2", "0.1.1")).toBe(1);
    expect(compareVersions("0.1.1", "v0.1.1")).toBe(0);
    expect(compareVersions("0.1.0", "0.1.1")).toBe(-1);
  });
});

describe("checkForUpdate", () => {
  it("returns the downloadable arm64 DMG when GitHub has a newer release", async () => {
    const deps = createDeps({
      fetch: vi.fn(async () => jsonResponse(githubRelease("0.1.2")))
    });

    await expect(checkForUpdate(deps)).resolves.toEqual({
      available: true,
      currentVersion: "0.1.1",
      latestVersion: "0.1.2",
      releaseUrl: "https://github.com/gr8woo/gmail-mac-client/releases/tag/v0.1.2",
      assetName: "Simple.Gmail.Client-0.1.2-arm64.dmg",
      downloadUrl:
        "https://github.com/gr8woo/gmail-mac-client/releases/download/v0.1.2/Simple.Gmail.Client-0.1.2-arm64.dmg",
      publishedAt: "2026-06-01T02:14:49Z"
    });
    expect(deps.fetch).toHaveBeenCalledWith("https://api.github.com/repos/gr8woo/gmail-mac-client/releases/latest", {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Simple-Gmail-Client"
      }
    });
  });

  it("returns unavailable when the latest release is not newer", async () => {
    const deps = createDeps({
      fetch: vi.fn(async () => jsonResponse(githubRelease("0.1.1")))
    });

    await expect(checkForUpdate(deps)).resolves.toEqual({
      available: false,
      currentVersion: "0.1.1",
      latestVersion: "0.1.1"
    });
  });

  it("falls back to GitHub's latest release redirect when the API rate limit is exhausted", async () => {
    const deps = createDeps({
      fetch: vi
        .fn()
        .mockResolvedValueOnce(rateLimitResponse())
        .mockResolvedValueOnce(
          new Response(null, {
            status: 302,
            headers: {
              location: "https://github.com/gr8woo/gmail-mac-client/releases/tag/v0.1.4"
            }
          })
        )
    });

    await expect(checkForUpdate(deps)).resolves.toEqual({
      available: true,
      currentVersion: "0.1.1",
      latestVersion: "0.1.4",
      releaseUrl: "https://github.com/gr8woo/gmail-mac-client/releases/tag/v0.1.4",
      assetName: "Simple.Gmail.Client-0.1.4-arm64.dmg",
      downloadUrl:
        "https://github.com/gr8woo/gmail-mac-client/releases/download/v0.1.4/Simple.Gmail.Client-0.1.4-arm64.dmg",
      publishedAt: ""
    });
    expect(deps.fetch).toHaveBeenLastCalledWith("https://github.com/gr8woo/gmail-mac-client/releases/latest", {
      method: "HEAD",
      redirect: "manual"
    });
  });
});

describe("downloadAndOpenUpdate", () => {
  it("downloads the latest update DMG to Downloads and opens it", async () => {
    const deps = createDeps({
      fetch: vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(githubRelease("0.1.2")))
        .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    });

    await expect(downloadAndOpenUpdate(deps)).resolves.toEqual({
      downloadedPath: "/Users/test/Downloads/Simple.Gmail.Client-0.1.2-arm64.dmg",
      update: {
        available: true,
        currentVersion: "0.1.1",
        latestVersion: "0.1.2",
        releaseUrl: "https://github.com/gr8woo/gmail-mac-client/releases/tag/v0.1.2",
        assetName: "Simple.Gmail.Client-0.1.2-arm64.dmg",
        downloadUrl:
          "https://github.com/gr8woo/gmail-mac-client/releases/download/v0.1.2/Simple.Gmail.Client-0.1.2-arm64.dmg",
        publishedAt: "2026-06-01T02:14:49Z"
      }
    });
    expect(deps.writeFile).toHaveBeenCalledWith(
      "/Users/test/Downloads/Simple.Gmail.Client-0.1.2-arm64.dmg",
      new Uint8Array([1, 2, 3])
    );
    expect(deps.openPath).toHaveBeenCalledWith("/Users/test/Downloads/Simple.Gmail.Client-0.1.2-arm64.dmg");
  });
});
