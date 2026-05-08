export interface GmailProfile {
  id: string;
  displayName: string;
  partition: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileState {
  profiles: GmailProfile[];
  lastActiveProfileId: string | null;
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
    createdAt: now,
    updatedAt: now
  };
}
