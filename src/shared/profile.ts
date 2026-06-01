export const MAX_PROFILES = 5;

export type GoogleAppKind = "mail" | "calendar";

export interface ActiveGoogleSurface {
  profileId: string;
  appKind: GoogleAppKind;
}

export interface GmailProfile {
  id: string;
  displayName: string;
  partition: string;
  email?: string;
  avatarUrl?: string;
  calendarEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileState {
  profiles: GmailProfile[];
  lastActiveProfileId: string | null;
  lastActiveSurface: ActiveGoogleSurface | null;
}

export function normalizeProfileName(name: string): string {
  const normalized = name.trim();

  if (!normalized) {
    throw new Error("Profile name is required");
  }

  return normalized;
}

export function getPartitionName(profileId: string): string {
  return `persist:gmail-profile-${profileId}`;
}

export function createProfile(displayName: string, id: string, now: string): GmailProfile {
  const normalizedName = normalizeProfileName(displayName);

  return {
    id,
    displayName: normalizedName,
    partition: getPartitionName(id),
    calendarEnabled: false,
    createdAt: now,
    updatedAt: now
  };
}

export function getSurfaceKey(surface: ActiveGoogleSurface): `${string}:${GoogleAppKind}` {
  return `${surface.profileId}:${surface.appKind}`;
}

export function getGoogleAppLabel(appKind: GoogleAppKind): string {
  return appKind === "calendar" ? "Calendar" : "Gmail";
}
