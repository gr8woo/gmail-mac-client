import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileProfileStore } from "../../src/main/profileStore";

let tempDir: string | undefined;

function makeStore() {
  tempDir = mkdtempSync(join(tmpdir(), "gmail-client-store-"));
  return new FileProfileStore(join(tempDir, "profiles.json"));
}

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("FileProfileStore", () => {
  it("starts empty", () => {
    const store = makeStore();
    expect(store.getState()).toEqual({ profiles: [], lastActiveProfileId: null });
  });

  it("creates and persists a profile", () => {
    const store = makeStore();
    const profile = store.createProfile("Work", "2026-05-08T00:00:00.000Z");
    const reloaded = new FileProfileStore(store.filePath);

    expect(profile.displayName).toBe("Work");
    expect(reloaded.getState().profiles).toHaveLength(1);
    expect(reloaded.getState().lastActiveProfileId).toBe(profile.id);
  });

  it("renames a profile", () => {
    const store = makeStore();
    const profile = store.createProfile("Work", "2026-05-08T00:00:00.000Z");

    store.renameProfile(profile.id, "Primary Work", "2026-05-08T01:00:00.000Z");

    expect(store.getState().profiles[0]?.displayName).toBe("Primary Work");
    expect(store.getState().profiles[0]?.updatedAt).toBe("2026-05-08T01:00:00.000Z");
  });

  it("deletes a profile and clears last active when needed", () => {
    const store = makeStore();
    const profile = store.createProfile("Work", "2026-05-08T00:00:00.000Z");

    store.deleteProfile(profile.id);

    expect(store.getState()).toEqual({ profiles: [], lastActiveProfileId: null });
  });

  it("sets last active profile", () => {
    const store = makeStore();
    const profile = store.createProfile("Work", "2026-05-08T00:00:00.000Z");

    store.setLastActiveProfile(profile.id);

    expect(store.getState().lastActiveProfileId).toBe(profile.id);
  });
});
