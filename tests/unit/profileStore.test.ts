import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
    expect(store.getState()).toEqual({ profiles: [], lastActiveProfileId: null, lastActiveSurface: null });
  });

  it("creates and persists a profile", () => {
    const store = makeStore();
    const profile = store.createProfile("Work", "2026-05-08T00:00:00.000Z");
    const reloaded = new FileProfileStore(store.filePath);

    expect(profile.displayName).toBe("Work");
    expect(reloaded.getState().profiles).toHaveLength(1);
    expect(reloaded.getState().lastActiveProfileId).toBe(profile.id);
  });

  it("persists valid state after repeated saves", () => {
    const store = makeStore();
    const profile = store.createProfile("Work", "2026-05-08T00:00:00.000Z");

    store.renameProfile(profile.id, "Primary Work", "2026-05-08T01:00:00.000Z");

    const reloaded = new FileProfileStore(store.filePath);
    expect(reloaded.getState()).toEqual({
      profiles: [
        {
          ...profile,
          displayName: "Primary Work",
          updatedAt: "2026-05-08T01:00:00.000Z"
        }
      ],
      lastActiveProfileId: profile.id,
      lastActiveSurface: { profileId: profile.id, appKind: "mail" }
    });
  });

  it("throws a clear error for invalid persisted state shape", () => {
    const store = makeStore();
    writeFileSync(store.filePath, JSON.stringify({ profiles: "invalid", lastActiveProfileId: null }), "utf8");

    expect(() => store.getState()).toThrow("Invalid profile store: profiles must be an array");
  });

  it("loads missing last active profile as null", () => {
    const store = makeStore();
    writeFileSync(store.filePath, JSON.stringify({ profiles: [] }), "utf8");

    expect(store.getState()).toEqual({ profiles: [], lastActiveProfileId: null, lastActiveSurface: null });
  });

  it("migrates stored profiles with calendar disabled by default", () => {
    const store = makeStore();
    writeFileSync(
      store.filePath,
      JSON.stringify({
        profiles: [
          {
            id: "work",
            displayName: "Work",
            partition: "persist:gmail-profile-work",
            createdAt: "2026-05-19T00:00:00.000Z",
            updatedAt: "2026-05-19T00:00:00.000Z"
          }
        ],
        lastActiveProfileId: "work"
      }),
      "utf8"
    );

    expect(store.getState()).toEqual({
      profiles: [
        {
          id: "work",
          displayName: "Work",
          partition: "persist:gmail-profile-work",
          calendarEnabled: false,
          createdAt: "2026-05-19T00:00:00.000Z",
          updatedAt: "2026-05-19T00:00:00.000Z"
        }
      ],
      lastActiveProfileId: "work",
      lastActiveSurface: { profileId: "work", appKind: "mail" }
    });
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

    expect(store.getState()).toEqual({ profiles: [], lastActiveProfileId: null, lastActiveSurface: null });
  });

  it("sets last active profile", () => {
    const store = makeStore();
    const profile = store.createProfile("Work", "2026-05-08T00:00:00.000Z");

    store.setLastActiveProfile(profile.id);

    expect(store.getState().lastActiveProfileId).toBe(profile.id);
    expect(store.getState().lastActiveSurface).toEqual({ profileId: profile.id, appKind: "mail" });
  });

  it("enables and disables calendar for a profile", () => {
    const store = makeStore();
    const profile = store.createProfile("Work", "2026-05-19T00:00:00.000Z");

    expect(store.setProfileCalendarEnabled(profile.id, true, "2026-05-19T01:00:00.000Z").calendarEnabled).toBe(true);
    expect(store.setProfileCalendarEnabled(profile.id, false, "2026-05-19T02:00:00.000Z").calendarEnabled).toBe(false);
  });

  it("persists the last active surface", () => {
    const store = makeStore();
    const profile = store.createProfile("Work", "2026-05-19T00:00:00.000Z");

    store.setProfileCalendarEnabled(profile.id, true, "2026-05-19T01:00:00.000Z");
    store.setLastActiveSurface({ profileId: profile.id, appKind: "calendar" });

    const reloaded = new FileProfileStore(store.filePath);
    expect(reloaded.getState().lastActiveProfileId).toBe(profile.id);
    expect(reloaded.getState().lastActiveSurface).toEqual({ profileId: profile.id, appKind: "calendar" });
  });

  it("rejects calendar as the last active surface when calendar is disabled", () => {
    const store = makeStore();
    const profile = store.createProfile("Work", "2026-05-19T00:00:00.000Z");
    const stateBeforeRejection = store.getState();

    expect(() => store.setLastActiveSurface({ profileId: profile.id, appKind: "calendar" })).toThrow(
      `Calendar is not enabled for profile: ${profile.id}`
    );
    expect(store.getState()).toEqual(stateBeforeRejection);
  });

  it("rejects unknown Google app kinds as the last active surface", () => {
    const store = makeStore();
    const profile = store.createProfile("Work", "2026-05-19T00:00:00.000Z");
    const stateBeforeRejection = store.getState();

    expect(() =>
      store.setLastActiveSurface({ profileId: profile.id, appKind: "drive" } as unknown as Parameters<
        typeof store.setLastActiveSurface
      >[0])
    ).toThrow("Invalid Google app kind: drive");
    expect(store.getState()).toEqual(stateBeforeRejection);
  });

  it("falls back to mail when disabling the active calendar surface", () => {
    const store = makeStore();
    const profile = store.createProfile("Work", "2026-05-19T00:00:00.000Z");
    store.setProfileCalendarEnabled(profile.id, true);
    store.setLastActiveSurface({ profileId: profile.id, appKind: "calendar" });

    store.setProfileCalendarEnabled(profile.id, false);

    expect(store.getState().lastActiveSurface).toEqual({ profileId: profile.id, appKind: "mail" });
  });

  it("falls back to mail when stored calendar surface is disabled", () => {
    const store = makeStore();
    writeFileSync(
      store.filePath,
      JSON.stringify({
        profiles: [
          {
            id: "work",
            displayName: "Work",
            partition: "persist:gmail-profile-work",
            calendarEnabled: false,
            createdAt: "2026-05-19T00:00:00.000Z",
            updatedAt: "2026-05-19T00:00:00.000Z"
          }
        ],
        lastActiveProfileId: "work",
        lastActiveSurface: { profileId: "work", appKind: "calendar" }
      }),
      "utf8"
    );

    expect(store.getState().lastActiveSurface).toEqual({ profileId: "work", appKind: "mail" });
  });

  it("rejects creating more than five profiles", () => {
    const store = makeStore();

    for (let index = 1; index <= 5; index += 1) {
      store.createProfile(`Profile ${index}`, "2026-05-08T00:00:00.000Z");
    }

    expect(() => store.createProfile("Profile 6", "2026-05-08T00:00:00.000Z")).toThrow(
      "You can create up to 5 Gmail profiles"
    );
  });

  it("loads and preserves Gmail account metadata", () => {
    const store = makeStore();
    writeFileSync(
      store.filePath,
      JSON.stringify({
        profiles: [
          {
            id: "profile_1",
            displayName: "Work",
            partition: "persist:gmail-profile-profile_1",
            email: "work.user@example.com",
            avatarUrl: "https://lh3.googleusercontent.com/a/work-avatar",
            createdAt: "2026-05-08T00:00:00.000Z",
            updatedAt: "2026-05-08T01:00:00.000Z"
          }
        ],
        lastActiveProfileId: "profile_1"
      }),
      "utf8"
    );

    expect(store.getState().profiles[0]).toMatchObject({
      email: "work.user@example.com",
      avatarUrl: "https://lh3.googleusercontent.com/a/work-avatar"
    });
  });

  it("updates Gmail account metadata without changing the display name", () => {
    const store = makeStore();
    const profile = store.createProfile("Work", "2026-05-08T00:00:00.000Z");

    const updated = store.updateProfileMetadata(
      profile.id,
      {
        email: "work.user@example.com",
        avatarUrl: "https://lh3.googleusercontent.com/a/work-avatar"
      },
      "2026-05-08T01:00:00.000Z"
    );

    expect(updated).toMatchObject({
      displayName: "Work",
      email: "work.user@example.com",
      avatarUrl: "https://lh3.googleusercontent.com/a/work-avatar",
      updatedAt: "2026-05-08T01:00:00.000Z"
    });
    expect(store.getState().profiles[0]).toMatchObject({
      email: "work.user@example.com",
      avatarUrl: "https://lh3.googleusercontent.com/a/work-avatar"
    });
  });
});
