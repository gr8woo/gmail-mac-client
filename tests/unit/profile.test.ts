import { describe, expect, it } from "vitest";
import {
  createProfile,
  getGoogleAppLabel,
  getPartitionName,
  getSurfaceKey,
  MAX_PROFILES,
  normalizeProfileName
} from "../../src/shared/profile";

describe("profile helpers", () => {
  it("normalizes profile names", () => {
    expect(normalizeProfileName("  Work Mail  ")).toBe("Work Mail");
  });

  it("rejects empty profile names", () => {
    expect(() => normalizeProfileName("   ")).toThrow("Profile name is required");
  });

  it("creates a profile with a persistent partition", () => {
    const profile = createProfile("Work", "profile_123", "2026-05-08T00:00:00.000Z");

    expect(profile).toEqual({
      id: "profile_123",
      displayName: "Work",
      partition: "persist:gmail-profile-profile_123",
      calendarEnabled: false,
      createdAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z"
    });
  });

  it("creates profiles with calendar disabled by default", () => {
    expect(createProfile("Work", "profile-1", "2026-05-19T00:00:00.000Z")).toEqual({
      id: "profile-1",
      displayName: "Work",
      partition: "persist:gmail-profile-profile-1",
      calendarEnabled: false,
      createdAt: "2026-05-19T00:00:00.000Z",
      updatedAt: "2026-05-19T00:00:00.000Z"
    });
  });

  it("builds stable surface keys", () => {
    expect(getSurfaceKey({ profileId: "work", appKind: "mail" })).toBe("work:mail");
    expect(getSurfaceKey({ profileId: "work", appKind: "calendar" })).toBe("work:calendar");
  });

  it("labels Google app kinds", () => {
    expect(getGoogleAppLabel("mail")).toBe("Gmail");
    expect(getGoogleAppLabel("calendar")).toBe("Calendar");
  });

  it("derives partition names from profile ids", () => {
    expect(getPartitionName("abc")).toBe("persist:gmail-profile-abc");
  });

  it("limits local Gmail profiles to five accounts", () => {
    expect(MAX_PROFILES).toBe(5);
  });
});
