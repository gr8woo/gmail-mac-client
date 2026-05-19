import type { ActiveGoogleSurface, GmailProfile, ProfileState } from "../shared/profile";
import type { AgentChatResponse, AgentProviderId, AgentProviderStatus, ClaudeCodeStatus } from "../shared/agent";

declare global {
  interface Window {
    gmailClient: {
      getProfileState(): Promise<ProfileState>;
      createProfile(displayName: string): Promise<GmailProfile>;
      renameProfile(profileId: string, displayName: string): Promise<GmailProfile>;
      updateProfileEmail(profileId: string, email: string): Promise<GmailProfile>;
      deleteProfile(profileId: string): Promise<void>;
      switchProfile(profileId: string): Promise<void>;
      setProfileCalendarEnabled(profileId: string, enabled: boolean): Promise<GmailProfile>;
      switchSurface(surface: ActiveGoogleSurface): Promise<void>;
      setChromeHeight(height: number): Promise<void>;
      setGmailViewVisible(visible: boolean): Promise<void>;
      setGmailRightInset(width: number): Promise<void>;
      refreshGmailView(): Promise<void>;
      refreshCurrentSurface(): Promise<void>;
      getClaudeCodeStatus(): Promise<ClaudeCodeStatus>;
      getAgentProviders(): Promise<AgentProviderStatus[]>;
      startAgentProviderLogin(providerId: AgentProviderId): Promise<void>;
      sendAgentMessage(providerId: AgentProviderId, message: string): Promise<AgentChatResponse>;
      onProfilesChanged(callback: () => void): () => void;
    };
  }
}

export const gmailClient = {
  getProfileState: () => window.gmailClient.getProfileState(),
  createProfile: (displayName: string) => window.gmailClient.createProfile(displayName),
  renameProfile: (profileId: string, displayName: string) => window.gmailClient.renameProfile(profileId, displayName),
  updateProfileEmail: (profileId: string, email: string) => window.gmailClient.updateProfileEmail(profileId, email),
  deleteProfile: (profileId: string) => window.gmailClient.deleteProfile(profileId),
  switchProfile: (profileId: string) => window.gmailClient.switchProfile(profileId),
  setProfileCalendarEnabled: (profileId: string, enabled: boolean) =>
    window.gmailClient.setProfileCalendarEnabled(profileId, enabled),
  switchSurface: (surface: ActiveGoogleSurface) => window.gmailClient.switchSurface(surface),
  setChromeHeight: (height: number) => window.gmailClient.setChromeHeight(height),
  setGmailViewVisible: (visible: boolean) => window.gmailClient.setGmailViewVisible(visible),
  setGmailRightInset: (width: number) => window.gmailClient.setGmailRightInset(width),
  refreshGmailView: () => window.gmailClient.refreshGmailView(),
  refreshCurrentSurface: () => window.gmailClient.refreshCurrentSurface(),
  getClaudeCodeStatus: () => window.gmailClient.getClaudeCodeStatus(),
  getAgentProviders: () => window.gmailClient.getAgentProviders(),
  startAgentProviderLogin: (providerId: AgentProviderId) => window.gmailClient.startAgentProviderLogin(providerId),
  sendAgentMessage: (providerId: AgentProviderId, message: string) =>
    window.gmailClient.sendAgentMessage(providerId, message),
  onProfilesChanged: (callback: () => void) => window.gmailClient.onProfilesChanged(callback)
};
