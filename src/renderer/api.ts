import type { GmailProfile, ProfileState } from "../shared/profile";

declare global {
  interface Window {
    gmailClient: {
      getProfileState(): Promise<ProfileState>;
      createProfile(displayName: string): Promise<GmailProfile>;
      renameProfile(profileId: string, displayName: string): Promise<GmailProfile>;
      deleteProfile(profileId: string): Promise<void>;
      switchProfile(profileId: string): Promise<void>;
    };
  }
}

export const gmailClient = {
  getProfileState: () => window.gmailClient.getProfileState(),
  createProfile: (displayName: string) => window.gmailClient.createProfile(displayName),
  renameProfile: (profileId: string, displayName: string) => window.gmailClient.renameProfile(profileId, displayName),
  deleteProfile: (profileId: string) => window.gmailClient.deleteProfile(profileId),
  switchProfile: (profileId: string) => window.gmailClient.switchProfile(profileId)
};
