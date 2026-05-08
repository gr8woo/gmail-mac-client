import { app, ipcMain, session } from "electron";
import type { IpcMainInvokeEvent, WebFrameMain } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getPartitionName } from "../shared/profile";
import { FileProfileStore } from "./profileStore";

const allowedDevServerOrigin = "http://127.0.0.1:5173";
const profileIpcChannels = [
  "profiles:getState",
  "profiles:create",
  "profiles:rename",
  "profiles:delete",
  "profiles:switch"
] as const;

export interface ProfileSwitchTarget {
  switchToProfile(profileId: string): Promise<void>;
  clearProfileView(): void;
  closeProfileView(profileId: string): void;
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

  ipcMain.handle("profiles:getState", (event) => {
    assertTrustedSender(event);
    return getRegistration().store.getState();
  });

  ipcMain.handle("profiles:create", async (event, displayName: unknown) => {
    assertTrustedSender(event);
    const { store, target } = getRegistration();
    const profile = store.createProfile(requireString(displayName, "displayName"));
    await target.switchToProfile(profile.id);
    return profile;
  });

  ipcMain.handle("profiles:rename", (event, profileId: unknown, displayName: unknown) => {
    assertTrustedSender(event);
    return getRegistration().store.renameProfile(
      requireString(profileId, "profileId"),
      requireString(displayName, "displayName")
    );
  });

  ipcMain.handle("profiles:delete", async (event, profileId: unknown) => {
    assertTrustedSender(event);
    const { store, target } = getRegistration();
    const id = requireString(profileId, "profileId");
    const stateBeforeDelete = store.getState();
    const profile = stateBeforeDelete.profiles.find((candidate) => candidate.id === id);

    if (!profile) {
      return;
    }

    const wasActiveProfile = stateBeforeDelete.lastActiveProfileId === id;

    target.closeProfileView(id);
    await session.fromPartition(getPartitionName(profile.id)).clearStorageData();

    store.deleteProfile(id);

    if (!wasActiveProfile) {
      return;
    }

    const nextProfileId = store.getState().lastActiveProfileId;
    if (nextProfileId) {
      await target.switchToProfile(nextProfileId);
    } else {
      target.clearProfileView();
    }
  });

  ipcMain.handle("profiles:switch", async (event, profileId: unknown) => {
    assertTrustedSender(event);
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

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedSenderFrame(event.senderFrame)) {
    throw new Error("Untrusted profile IPC sender");
  }
}

function isTrustedSenderFrame(frame: WebFrameMain | null): boolean {
  if (!frame || frame.isDestroyed() || frame.parent !== null) {
    return false;
  }

  if (!app.isPackaged && frame.origin === allowedDevServerOrigin) {
    return true;
  }

  return frame.url === getRendererIndexUrl().href;
}

function getRendererIndexUrl(): URL {
  return pathToFileURL(join(__dirname, "../renderer/index.html"));
}
