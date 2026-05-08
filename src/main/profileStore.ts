import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createProfile, normalizeProfileName } from "../shared/profile";
import type { GmailProfile, ProfileState } from "../shared/profile";

const EMPTY_STATE: ProfileState = {
  profiles: [],
  lastActiveProfileId: null
};

export class FileProfileStore {
  constructor(public readonly filePath: string) {}

  getState(): ProfileState {
    if (!existsSync(this.filePath)) {
      return { ...EMPTY_STATE, profiles: [] };
    }

    const raw = readFileSync(this.filePath, "utf8");
    return parseProfileState(raw);
  }

  createProfile(displayName: string, now = new Date().toISOString()): GmailProfile {
    const state = this.getState();
    const profile = createProfile(displayName, randomUUID(), now);

    this.saveState({
      profiles: [...state.profiles, profile],
      lastActiveProfileId: profile.id
    });

    return profile;
  }

  renameProfile(profileId: string, displayName: string, now = new Date().toISOString()): GmailProfile {
    const state = this.getState();
    const normalizedName = normalizeProfileName(displayName);
    let renamedProfile: GmailProfile | undefined;

    const profiles = state.profiles.map((profile) => {
      if (profile.id !== profileId) {
        return profile;
      }

      renamedProfile = {
        ...profile,
        displayName: normalizedName,
        updatedAt: now
      };

      return renamedProfile;
    });

    if (!renamedProfile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    this.saveState({ ...state, profiles });
    return renamedProfile;
  }

  deleteProfile(profileId: string): void {
    const state = this.getState();
    const profiles = state.profiles.filter((profile) => profile.id !== profileId);
    const lastActiveProfileId =
      state.lastActiveProfileId === profileId ? profiles[0]?.id ?? null : state.lastActiveProfileId;

    this.saveState({ profiles, lastActiveProfileId });
  }

  setLastActiveProfile(profileId: string): void {
    const state = this.getState();

    if (!state.profiles.some((profile) => profile.id === profileId)) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    this.saveState({ ...state, lastActiveProfileId: profileId });
  }

  private saveState(state: ProfileState): void {
    const fileDir = dirname(this.filePath);
    const tempFilePath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;

    mkdirSync(fileDir, { recursive: true });
    writeFileSync(tempFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    renameSync(tempFilePath, this.filePath);
  }
}

function parseProfileState(raw: string): ProfileState {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unreadable JSON";
    throw new Error(`Invalid profile store: ${reason}`);
  }

  if (!isRecord(parsed)) {
    throw new Error("Invalid profile store: root must be an object");
  }

  if (!Array.isArray(parsed.profiles)) {
    throw new Error("Invalid profile store: profiles must be an array");
  }

  const profiles = parsed.profiles.map((profile, index) => validateProfile(profile, index));
  const { lastActiveProfileId } = parsed;

  if (typeof lastActiveProfileId !== "string" && lastActiveProfileId !== null) {
    throw new Error("Invalid profile store: lastActiveProfileId must be a string or null");
  }

  return {
    profiles,
    lastActiveProfileId
  };
}

function validateProfile(profile: unknown, index: number): GmailProfile {
  if (!isRecord(profile)) {
    throw new Error(`Invalid profile store: profiles[${index}] must be an object`);
  }

  const fields = ["id", "displayName", "partition", "createdAt", "updatedAt"] as const;

  for (const field of fields) {
    if (typeof profile[field] !== "string") {
      throw new Error(`Invalid profile store: profiles[${index}].${field} must be a string`);
    }
  }

  return {
    id: getProfileString(profile, "id"),
    displayName: getProfileString(profile, "displayName"),
    partition: getProfileString(profile, "partition"),
    createdAt: getProfileString(profile, "createdAt"),
    updatedAt: getProfileString(profile, "updatedAt")
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getProfileString(profile: Record<string, unknown>, field: keyof GmailProfile): string {
  const value = profile[field];

  if (typeof value !== "string") {
    throw new Error(`Invalid profile store: ${field} must be a string`);
  }

  return value;
}
