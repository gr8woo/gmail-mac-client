import { describe, expect, it } from "vitest";
import { createProfile, getPartitionName, normalizeProfileName } from "../../src/shared/profile";

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
      createdAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z"
    });
  });

  it("derives partition names from profile ids", () => {
    expect(getPartitionName("abc")).toBe("persist:gmail-profile-abc");
  });
});
