import { contextBridge, ipcRenderer } from "electron";
import type { GmailProfile, ProfileState } from "../shared/profile";

export interface GmailClientApi {
  getProfileState(): Promise<ProfileState>;
  createProfile(displayName: string): Promise<GmailProfile>;
  renameProfile(profileId: string, displayName: string): Promise<GmailProfile>;
  deleteProfile(profileId: string): Promise<void>;
  switchProfile(profileId: string): Promise<void>;
}

const api: GmailClientApi = {
  getProfileState: () => ipcRenderer.invoke("profiles:getState"),
  createProfile: (displayName) => ipcRenderer.invoke("profiles:create", displayName),
  renameProfile: (profileId, displayName) => ipcRenderer.invoke("profiles:rename", profileId, displayName),
  deleteProfile: (profileId) => ipcRenderer.invoke("profiles:delete", profileId),
  switchProfile: (profileId) => ipcRenderer.invoke("profiles:switch", profileId)
};

contextBridge.exposeInMainWorld("gmailClient", api);
