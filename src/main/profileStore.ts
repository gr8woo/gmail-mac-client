import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
    const parsed = JSON.parse(raw) as ProfileState;

    return {
      profiles: parsed.profiles ?? [],
      lastActiveProfileId: parsed.lastActiveProfileId ?? null
    };
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
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }
}
