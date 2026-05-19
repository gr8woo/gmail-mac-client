import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createProfile, MAX_PROFILES, normalizeProfileName } from "../shared/profile";
import type { ActiveGoogleSurface, GmailProfile, ProfileState } from "../shared/profile";

const EMPTY_STATE: ProfileState = {
  profiles: [],
  lastActiveProfileId: null,
  lastActiveSurface: null
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

    if (state.profiles.length >= MAX_PROFILES) {
      throw new Error(`You can create up to ${MAX_PROFILES} Gmail profiles`);
    }

    const profile = createProfile(displayName, randomUUID(), now);

    this.saveState({
      profiles: [...state.profiles, profile],
      lastActiveProfileId: profile.id,
      lastActiveSurface: { profileId: profile.id, appKind: "mail" }
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

  updateProfileMetadata(
    profileId: string,
    metadata: Partial<Pick<GmailProfile, "email" | "avatarUrl">>,
    now = new Date().toISOString()
  ): GmailProfile {
    const state = this.getState();
    let updatedProfile: GmailProfile | undefined;

    const profiles = state.profiles.map((profile) => {
      if (profile.id !== profileId) {
        return profile;
      }

      updatedProfile = {
        ...profile,
        ...pickProfileMetadata(metadata),
        updatedAt: now
      };

      return updatedProfile;
    });

    if (!updatedProfile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    this.saveState({ ...state, profiles });
    return updatedProfile;
  }

  deleteProfile(profileId: string): void {
    const state = this.getState();
    const profiles = state.profiles.filter((profile) => profile.id !== profileId);
    const lastActiveProfileId =
      state.lastActiveProfileId === profileId ? profiles[0]?.id ?? null : state.lastActiveProfileId;
    const lastActiveSurface =
      state.lastActiveSurface?.profileId === profileId
        ? getMailSurface(lastActiveProfileId)
        : parseLastActiveSurface(state.lastActiveSurface, profiles, lastActiveProfileId);

    this.saveState({ profiles, lastActiveProfileId, lastActiveSurface });
  }

  setLastActiveProfile(profileId: string): void {
    const state = this.getState();

    if (!state.profiles.some((profile) => profile.id === profileId)) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    this.saveState({
      ...state,
      lastActiveProfileId: profileId,
      lastActiveSurface: { profileId, appKind: "mail" }
    });
  }

  setProfileCalendarEnabled(profileId: string, enabled: boolean, now = new Date().toISOString()): GmailProfile {
    const state = this.getState();
    let updatedProfile: GmailProfile | undefined;

    const profiles = state.profiles.map((profile) => {
      if (profile.id !== profileId) {
        return profile;
      }

      updatedProfile = {
        ...profile,
        calendarEnabled: enabled,
        updatedAt: now
      };

      return updatedProfile;
    });

    if (!updatedProfile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const lastActiveSurface =
      !enabled &&
      state.lastActiveSurface?.profileId === profileId &&
      state.lastActiveSurface.appKind === "calendar"
        ? { profileId, appKind: "mail" as const }
        : state.lastActiveSurface;

    this.saveState({ ...state, profiles, lastActiveSurface });
    return updatedProfile;
  }

  setLastActiveSurface(surface: ActiveGoogleSurface): void {
    const state = this.getState();

    if (surface.appKind !== "mail" && surface.appKind !== "calendar") {
      throw new Error(`Invalid Google app kind: ${String(surface.appKind)}`);
    }

    const profile = state.profiles.find((candidate) => candidate.id === surface.profileId);

    if (!profile) {
      throw new Error(`Profile not found: ${surface.profileId}`);
    }

    if (surface.appKind === "calendar" && !profile.calendarEnabled) {
      throw new Error(`Calendar is not enabled for profile: ${surface.profileId}`);
    }

    this.saveState({
      ...state,
      lastActiveProfileId: surface.profileId,
      lastActiveSurface: surface
    });
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

  if (lastActiveProfileId !== undefined && typeof lastActiveProfileId !== "string" && lastActiveProfileId !== null) {
    throw new Error("Invalid profile store: lastActiveProfileId must be a string or null");
  }

  const normalizedLastActiveProfileId = lastActiveProfileId === undefined ? null : lastActiveProfileId;
  const lastActiveSurface = parseLastActiveSurface(parsed.lastActiveSurface, profiles, normalizedLastActiveProfileId);

  return {
    profiles,
    lastActiveProfileId: normalizedLastActiveProfileId,
    lastActiveSurface
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

  const validated: GmailProfile = {
    id: getProfileString(profile, "id"),
    displayName: getProfileString(profile, "displayName"),
    partition: getProfileString(profile, "partition"),
    calendarEnabled: profile.calendarEnabled === true,
    createdAt: getProfileString(profile, "createdAt"),
    updatedAt: getProfileString(profile, "updatedAt")
  };

  const metadata = pickProfileMetadata({
    email: profile.email,
    avatarUrl: profile.avatarUrl
  });

  return {
    ...validated,
    ...metadata
  };
}

function parseLastActiveSurface(
  surface: unknown,
  profiles: GmailProfile[],
  lastActiveProfileId: string | null
): ActiveGoogleSurface | null {
  if (!lastActiveProfileId || !profiles.some((profile) => profile.id === lastActiveProfileId)) {
    return null;
  }

  if (surface === undefined || surface === null) {
    return { profileId: lastActiveProfileId, appKind: "mail" };
  }

  if (!isRecord(surface)) {
    throw new Error("Invalid profile store: lastActiveSurface must be an object or null");
  }

  if (typeof surface.profileId !== "string") {
    throw new Error("Invalid profile store: lastActiveSurface.profileId must be a string");
  }

  if (surface.appKind !== "mail" && surface.appKind !== "calendar") {
    throw new Error("Invalid profile store: lastActiveSurface.appKind must be mail or calendar");
  }

  const profile = profiles.find((candidate) => candidate.id === surface.profileId);

  if (!profile) {
    return { profileId: lastActiveProfileId, appKind: "mail" };
  }

  if (surface.appKind === "calendar" && !profile.calendarEnabled) {
    return { profileId: profile.id, appKind: "mail" };
  }

  return {
    profileId: profile.id,
    appKind: surface.appKind
  };
}

function getMailSurface(profileId: string | null): ActiveGoogleSurface | null {
  return profileId ? { profileId, appKind: "mail" } : null;
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

function pickProfileMetadata(metadata: { email?: unknown; avatarUrl?: unknown }): Partial<
  Pick<GmailProfile, "email" | "avatarUrl">
> {
  const picked: Partial<Pick<GmailProfile, "email" | "avatarUrl">> = {};

  if (metadata.email !== undefined) {
    if (typeof metadata.email !== "string") {
      throw new Error("Invalid profile store: email must be a string");
    }

    picked.email = metadata.email;
  }

  if (metadata.avatarUrl !== undefined) {
    if (typeof metadata.avatarUrl !== "string") {
      throw new Error("Invalid profile store: avatarUrl must be a string");
    }

    picked.avatarUrl = metadata.avatarUrl;
  }

  return picked;
}
