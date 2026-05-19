import { app, ipcMain, session } from "electron";
import type { IpcMainInvokeEvent, WebFrameMain } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getPartitionName } from "../shared/profile";
import type { ActiveGoogleSurface } from "../shared/profile";
import type { AgentChatResponse, AgentProviderId, AgentProviderStatus, ClaudeCodeStatus } from "../shared/agent";
import type { GmailPageContext } from "../shared/agent";
import { ClaudeCodeBridge, createClaudeCodeBridge } from "./claudeCodeBridge";
import { AgentProviderRegistry, createAgentProviderRegistry } from "./agentProviderRegistry";
import { FileProfileStore } from "./profileStore";

const allowedDevServerOrigin = "http://127.0.0.1:5173";
const profileIpcChannels = [
  "profiles:getState",
  "profiles:create",
  "profiles:rename",
  "profiles:delete",
  "profiles:switch",
  "profiles:setCalendarEnabled",
  "profiles:switchSurface",
  "appChrome:setHeight",
  "appChrome:setGmailViewVisible",
  "appChrome:setGmailRightInset",
  "appChrome:refreshGmailView",
  "appChrome:refreshCurrentSurface",
  "claudeCode:getStatus",
  "claudeCode:sendMessage",
  "agent:getProviders",
  "agent:startProviderLogin",
  "agent:sendMessage"
] as const;

export interface ProfileSwitchTarget {
  switchToProfile(profileId: string): Promise<void>;
  switchToSurface(surface: ActiveGoogleSurface): Promise<void>;
  clearProfileView(): void;
  closeProfileView(profileId: string): void;
  closeSurfaceView(surface: ActiveGoogleSurface): void;
  setTopInset(height: number): void;
  setGmailViewVisible(visible: boolean): void;
  setRightInset(width: number): void;
  refreshCurrentView(): void;
  getCurrentPageContext(): Promise<GmailPageContext | null>;
}

interface ProfileIpcRegistration {
  store: FileProfileStore;
  target: ProfileSwitchTarget;
  claudeCodeBridge: ClaudeCodeBridge;
  agentProviderRegistry: AgentProviderRegistry;
}

let activeRegistration: ProfileIpcRegistration | null = null;
let registered = false;

export function createDefaultProfileStore(): FileProfileStore {
  return new FileProfileStore(join(app.getPath("userData"), "profiles.json"));
}

export function createDefaultAgentProviderRegistry(): AgentProviderRegistry {
  return createAgentProviderRegistry(undefined, {
    codexHome: join(app.getPath("userData"), "codex-home")
  });
}

export function registerProfileIpc(
  store: FileProfileStore,
  target: ProfileSwitchTarget,
  claudeCodeBridge = createClaudeCodeBridge(),
  agentProviderRegistry = createDefaultAgentProviderRegistry()
): void {
  activeRegistration = { store, target, claudeCodeBridge, agentProviderRegistry };

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

  ipcMain.handle("profiles:setCalendarEnabled", async (event, profileId: unknown, enabled: unknown) => {
    assertTrustedSender(event);
    const { store, target } = getRegistration();
    const id = requireString(profileId, "profileId");
    const isEnabled = requireBoolean(enabled, "enabled");
    const stateBeforeToggle = store.getState();
    const updatedProfile = store.setProfileCalendarEnabled(id, isEnabled);

    if (
      !isEnabled &&
      stateBeforeToggle.lastActiveSurface?.profileId === id &&
      stateBeforeToggle.lastActiveSurface.appKind === "calendar"
    ) {
      await target.switchToSurface({ profileId: id, appKind: "mail" });
    }

    if (!isEnabled) {
      target.closeSurfaceView({ profileId: id, appKind: "calendar" });
    }

    return updatedProfile;
  });

  ipcMain.handle("profiles:switchSurface", async (event, rawSurface: unknown) => {
    assertTrustedSender(event);
    const { store, target } = getRegistration();
    const surface = requireActiveSurface(rawSurface);

    store.setLastActiveSurface(surface);
    await target.switchToSurface(surface);
  });

  ipcMain.handle("appChrome:setHeight", (event, height: unknown) => {
    assertTrustedSender(event);
    getRegistration().target.setTopInset(requireChromeHeight(height));
  });

  ipcMain.handle("appChrome:setGmailViewVisible", (event, visible: unknown) => {
    assertTrustedSender(event);
    getRegistration().target.setGmailViewVisible(requireBoolean(visible, "visible"));
  });

  ipcMain.handle("appChrome:setGmailRightInset", (event, width: unknown) => {
    assertTrustedSender(event);
    getRegistration().target.setRightInset(requireChromeHeight(width));
  });

  ipcMain.handle("appChrome:refreshGmailView", (event) => {
    assertTrustedSender(event);
    getRegistration().target.refreshCurrentView();
  });

  ipcMain.handle("appChrome:refreshCurrentSurface", (event) => {
    assertTrustedSender(event);
    getRegistration().target.refreshCurrentView();
  });

  ipcMain.handle("claudeCode:getStatus", async (event): Promise<ClaudeCodeStatus> => {
    assertTrustedSender(event);
    return getRegistration().claudeCodeBridge.getStatus();
  });

  ipcMain.handle("claudeCode:sendMessage", async (event, message: unknown): Promise<AgentChatResponse> => {
    assertTrustedSender(event);
    const { claudeCodeBridge, target } = getRegistration();
    const context = await target.getCurrentPageContext().catch(() => null);
    return claudeCodeBridge.sendMessage(requireString(message, "message"), context);
  });

  ipcMain.handle("agent:getProviders", async (event): Promise<AgentProviderStatus[]> => {
    assertTrustedSender(event);
    return getRegistration().agentProviderRegistry.getProviders();
  });

  ipcMain.handle("agent:startProviderLogin", async (event, providerId: unknown): Promise<void> => {
    assertTrustedSender(event);
    await getRegistration().agentProviderRegistry.startProviderLogin(requireAgentProviderId(providerId));
  });

  ipcMain.handle(
    "agent:sendMessage",
    async (event, providerId: unknown, message: unknown): Promise<AgentChatResponse> => {
      assertTrustedSender(event);
      const { agentProviderRegistry, target } = getRegistration();
      const context = await target.getCurrentPageContext().catch(() => null);
      return agentProviderRegistry.sendMessage(
        requireAgentProviderId(providerId),
        requireString(message, "message"),
        context
      );
    }
  );

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

function requireChromeHeight(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("height must be a finite number");
  }

  return value;
}

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean`);
  }

  return value;
}

function requireActiveSurface(value: unknown): ActiveGoogleSurface {
  if (!value || typeof value !== "object") {
    throw new Error("surface must be an object");
  }

  const surface = value as Record<string, unknown>;
  const profileId = requireString(surface.profileId, "profileId");
  const appKind = surface.appKind;

  if (appKind !== "mail" && appKind !== "calendar") {
    throw new Error("appKind must be mail or calendar");
  }

  return { profileId, appKind };
}

function requireAgentProviderId(value: unknown): AgentProviderId {
  if (value === "claude-code" || value === "chatgpt-codex") {
    return value;
  }

  throw new Error("providerId must be a known AI provider");
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
