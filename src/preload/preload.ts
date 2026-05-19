import { contextBridge, ipcRenderer } from "electron";
import type { AgentChatResponse, AgentProviderId, AgentProviderStatus, ClaudeCodeStatus } from "../shared/agent";
import type { GmailProfile, ProfileState } from "../shared/profile";

export interface GmailClientApi {
  getProfileState(): Promise<ProfileState>;
  createProfile(displayName: string): Promise<GmailProfile>;
  renameProfile(profileId: string, displayName: string): Promise<GmailProfile>;
  deleteProfile(profileId: string): Promise<void>;
  switchProfile(profileId: string): Promise<void>;
  setChromeHeight(height: number): Promise<void>;
  setGmailViewVisible(visible: boolean): Promise<void>;
  setGmailRightInset(width: number): Promise<void>;
  refreshGmailView(): Promise<void>;
  getClaudeCodeStatus(): Promise<ClaudeCodeStatus>;
  getAgentProviders(): Promise<AgentProviderStatus[]>;
  startAgentProviderLogin(providerId: AgentProviderId): Promise<void>;
  sendAgentMessage(providerId: AgentProviderId, message: string): Promise<AgentChatResponse>;
  onProfilesChanged(callback: () => void): () => void;
}

const api: GmailClientApi = {
  getProfileState: () => ipcRenderer.invoke("profiles:getState"),
  createProfile: (displayName) => ipcRenderer.invoke("profiles:create", displayName),
  renameProfile: (profileId, displayName) => ipcRenderer.invoke("profiles:rename", profileId, displayName),
  deleteProfile: (profileId) => ipcRenderer.invoke("profiles:delete", profileId),
  switchProfile: (profileId) => ipcRenderer.invoke("profiles:switch", profileId),
  setChromeHeight: (height) => ipcRenderer.invoke("appChrome:setHeight", height),
  setGmailViewVisible: (visible) => ipcRenderer.invoke("appChrome:setGmailViewVisible", visible),
  setGmailRightInset: (width) => ipcRenderer.invoke("appChrome:setGmailRightInset", width),
  refreshGmailView: () => ipcRenderer.invoke("appChrome:refreshGmailView"),
  getClaudeCodeStatus: () => ipcRenderer.invoke("claudeCode:getStatus"),
  getAgentProviders: () => ipcRenderer.invoke("agent:getProviders"),
  startAgentProviderLogin: (providerId) => ipcRenderer.invoke("agent:startProviderLogin", providerId),
  sendAgentMessage: (providerId, message) => ipcRenderer.invoke("agent:sendMessage", providerId, message),
  onProfilesChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("profiles:changed", listener);
    return () => {
      ipcRenderer.removeListener("profiles:changed", listener);
    };
  }
};

contextBridge.exposeInMainWorld("gmailClient", api);
