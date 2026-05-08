import { app, ipcMain, session } from "electron";
import { join } from "node:path";
import { getPartitionName } from "../shared/profile";
import { FileProfileStore } from "./profileStore";

const profileIpcChannels = [
  "profiles:getState",
  "profiles:create",
  "profiles:rename",
  "profiles:delete",
  "profiles:switch"
] as const;

export interface ProfileSwitchTarget {
  switchToProfile(profileId: string): Promise<void>;
}

interface ProfileIpcRegistration {
  store: FileProfileStore;
  target: ProfileSwitchTarget;
}

let activeRegistration: ProfileIpcRegistration | null = null;
let registered = false;

export function createDefaultProfileStore(): FileProfileStore {
  return new FileProfileStore(join(app.getPath("userData"), "profiles.json"));
}

export function registerProfileIpc(store: FileProfileStore, target: ProfileSwitchTarget): void {
  activeRegistration = { store, target };

  if (registered) {
    return;
  }

  ipcMain.handle("profiles:getState", () => {
    return getRegistration().store.getState();
  });

  ipcMain.handle("profiles:create", async (_event, displayName: unknown) => {
    const { store, target } = getRegistration();
    const profile = store.createProfile(requireString(displayName, "displayName"));
    await target.switchToProfile(profile.id);
    return profile;
  });

  ipcMain.handle("profiles:rename", (_event, profileId: unknown, displayName: unknown) => {
    return getRegistration().store.renameProfile(
      requireString(profileId, "profileId"),
      requireString(displayName, "displayName")
    );
  });

  ipcMain.handle("profiles:delete", async (_event, profileId: unknown) => {
    const { store, target } = getRegistration();
    const id = requireString(profileId, "profileId");
    const profile = store.getState().profiles.find((candidate) => candidate.id === id);

    if (!profile) {
      return;
    }

    await session.fromPartition(getPartitionName(profile.id)).clearStorageData();

    store.deleteProfile(id);

    const nextProfileId = store.getState().lastActiveProfileId;
    if (nextProfileId) {
      await target.switchToProfile(nextProfileId);
    }
  });

  ipcMain.handle("profiles:switch", async (_event, profileId: unknown) => {
    const { store, target } = getRegistration();
    const id = requireString(profileId, "profileId");

    store.setLastActiveProfile(id);
    await target.switchToProfile(id);
  });

  registered = true;
}

export function unregisterProfileIpc(): void {
  for (const channel of profileIpcChannels) {
    ipcMain.removeHandler(channel);
  }

  activeRegistration = null;
  registered = false;
}

function getRegistration(): ProfileIpcRegistration {
  if (!activeRegistration) {
    throw new Error("Profile IPC has not been registered");
  }

  return activeRegistration;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }

  return value;
}
