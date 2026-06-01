import { useEffect, useState } from "react";
import { Download, MessageCircle, RefreshCw, Settings as SettingsIcon } from "lucide-react";
import { gmailClient } from "./api";
import { AgentChatPanel } from "./components/AgentChatPanel";
import type { ChatMessage } from "./components/AgentChatPanel";
import { FirstRun } from "./components/FirstRun";
import { SettingsPage } from "./components/SettingsPage";
import { ProfileSwitcher } from "./components/ProfileSwitcher";
import { StatusBar } from "./components/StatusBar";
import type { ActiveGoogleSurface, ProfileState } from "../shared/profile";
import type { AgentProviderId, AgentProviderStatus } from "../shared/agent";
import type { AvailableUpdate } from "../shared/update";

const APP_BAR_HEIGHT = 44;
const DEFAULT_AGENT_PANEL_WIDTH = 360;
const agentPanelWidthStorageKey = "gmail-client-agent-panel-width";
const agentProviderStorageKey = "gmail-client-agent-provider";
type AppPage = "mail" | "settings";

export function App() {
  const [state, setState] = useState<ProfileState | null>(null);
  const [page, setPage] = useState<AppPage>("mail");
  const [isAgentPanelOpen, setIsAgentPanelOpen] = useState(false);
  const [agentPanelWidth, setAgentPanelWidth] = useState(() => getStoredAgentPanelWidth());
  const [agentProviders, setAgentProviders] = useState<AgentProviderStatus[]>([]);
  const [selectedAgentProviderId, setSelectedAgentProviderId] = useState<AgentProviderId>(() =>
    getStoredAgentProviderId()
  );
  const [agentMessages, setAgentMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "연결된 AI 서비스를 선택하면 메일 작업을 도울 준비가 되어 있어요."
    }
  ]);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [status, setStatus] = useState<string | null>("Loading profiles...");

  async function refreshState(options: { clearStatus?: boolean } = {}) {
    const nextState = await gmailClient.getProfileState();
    setState(nextState);
    if (options.clearStatus ?? true) {
      setStatus(null);
    }
  }

  useEffect(() => {
    void refreshState().catch((caught) => {
      setStatus(caught instanceof Error ? caught.message : "Unable to load profiles");
    });
    void refreshAgentProviders().catch(() => undefined);
    void checkForAppUpdate().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isAgentPanelOpen) {
      return;
    }

    void refreshAgentProviders().catch((caught) => {
      setStatus(caught instanceof Error ? caught.message : "Unable to load AI providers");
    });
  }, [isAgentPanelOpen]);

  useEffect(() => {
    return gmailClient.onProfilesChanged(() => {
      void refreshState().catch((caught) => {
        setStatus(caught instanceof Error ? caught.message : "Unable to load profiles");
      });
    });
  }, []);

  useEffect(() => {
    if (!state || state.profiles.length === 0) {
      return;
    }

    void gmailClient.setChromeHeight(APP_BAR_HEIGHT).catch((caught) => {
      setStatus(caught instanceof Error ? caught.message : "Unable to resize Gmail view");
    });
    void gmailClient.setGmailViewVisible(page === "mail").catch((caught) => {
      setStatus(caught instanceof Error ? caught.message : "Unable to update Gmail view");
    });
    void gmailClient.setGmailRightInset(page === "mail" && isAgentPanelOpen ? agentPanelWidth : 0).catch((caught) => {
      setStatus(caught instanceof Error ? caught.message : "Unable to resize Gmail view");
    });

    return () => {
      void gmailClient.setChromeHeight(APP_BAR_HEIGHT).catch(() => undefined);
      void gmailClient.setGmailViewVisible(true).catch(() => undefined);
      void gmailClient.setGmailRightInset(0).catch(() => undefined);
    };
  }, [agentPanelWidth, isAgentPanelOpen, page, state]);

  function resizeAgentPanel(width: number) {
    setAgentPanelWidth(width);
    localStorage.setItem(agentPanelWidthStorageKey, String(width));
  }

  async function refreshAgentProviders() {
    const providers = await gmailClient.getAgentProviders();
    setAgentProviders(providers);
    selectAvailableProvider(providers);
  }

  async function checkForAppUpdate() {
    const update = await gmailClient.checkForUpdate();
    setAvailableUpdate(update.available ? update : null);
  }

  function selectAvailableProvider(providers: AgentProviderStatus[]) {
    const selectedProvider = providers.find((provider) => provider.id === selectedAgentProviderId);

    if (selectedProvider?.authenticated) {
      return;
    }

    const nextProvider = providers.find((provider) => provider.authenticated) ?? providers[0];

    if (!nextProvider || nextProvider.id === selectedAgentProviderId) {
      return;
    }

    setSelectedAgentProvider(nextProvider.id);
  }

  function setSelectedAgentProvider(providerId: AgentProviderId) {
    setSelectedAgentProviderId(providerId);
    localStorage.setItem(agentProviderStorageKey, providerId);
  }

  async function createProfile(displayName: string) {
    await gmailClient.createProfile(displayName);
    await refreshState();
  }

  const activeSurface = state?.lastActiveSurface ?? (
    state?.lastActiveProfileId ? { profileId: state.lastActiveProfileId, appKind: "mail" as const } : null
  );

  async function switchSurface(surface: ActiveGoogleSurface) {
    if (!surface.profileId || (surface.profileId === activeSurface?.profileId && surface.appKind === activeSurface.appKind)) {
      return;
    }

    try {
      await gmailClient.switchSurface(surface);
      await refreshState();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Unable to switch view");
      await refreshState({ clearStatus: false }).catch(() => undefined);
    }
  }

  async function renameProfile(profileId: string, displayName: string) {
    await gmailClient.renameProfile(profileId, displayName);
    await refreshState();
  }

  async function updateProfileEmail(profileId: string, email: string) {
    await gmailClient.updateProfileEmail(profileId, email);
    await refreshState();
  }

  async function setProfileCalendarEnabled(profileId: string, enabled: boolean) {
    try {
      await gmailClient.setProfileCalendarEnabled(profileId, enabled);
      await refreshState();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Unable to update Calendar setting");
      await refreshState({ clearStatus: false }).catch(() => undefined);
    }
  }

  async function deleteProfile(profileId: string) {
    const confirmed = window.confirm("Delete this profile and its local Gmail session data?");

    if (!confirmed) {
      return;
    }

    try {
      await gmailClient.deleteProfile(profileId);
      await refreshState();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Unable to delete profile");
      await refreshState({ clearStatus: false }).catch(() => undefined);
    }
  }

  async function refreshCurrentView() {
    try {
      await gmailClient.refreshCurrentSurface();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Unable to refresh current view");
    }
  }

  async function installUpdate() {
    if (!availableUpdate || isDownloadingUpdate) {
      return;
    }

    setIsDownloadingUpdate(true);
    setStatus(`Downloading update ${availableUpdate.latestVersion}...`);

    try {
      const result = await gmailClient.downloadAndOpenUpdate();
      setAvailableUpdate(result.update);
      setStatus(`Update ${result.update.latestVersion} opened. Quit this app before installing.`);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Unable to download update");
    } finally {
      setIsDownloadingUpdate(false);
    }
  }

  if (!state) {
    return <StatusBar message={status} />;
  }

  if (state.profiles.length === 0) {
    return (
      <main className="app-shell first-run-shell">
        <FirstRun onCreateProfile={createProfile} />
        <StatusBar message={status} />
      </main>
    );
  }

  if (page === "settings") {
    return (
      <SettingsPage
        profiles={state.profiles}
        activeProfileId={state.lastActiveProfileId}
        onCreateProfile={createProfile}
        onRenameProfile={renameProfile}
        onUpdateProfileEmail={updateProfileEmail}
        onSetProfileCalendarEnabled={setProfileCalendarEnabled}
        onDeleteProfile={deleteProfile}
        onBackToMail={() => setPage("mail")}
        status={status}
      />
    );
  }

  return (
    <main className="app-shell">
      <header className="app-bar">
        <ProfileSwitcher
          profiles={state.profiles}
          activeSurface={activeSurface}
          onSwitchSurface={switchSurface}
        />
        <StatusBar message={status} />
        {availableUpdate ? (
          <button
            type="button"
            className="settings-button update-button"
            disabled={isDownloadingUpdate}
            onClick={() => void installUpdate()}
            title={`Install update ${availableUpdate.latestVersion}`}
          >
            <Download className="settings-icon" aria-hidden="true" />
            <span className="visually-hidden">Install update {availableUpdate.latestVersion}</span>
          </button>
        ) : null}
        <button
          type="button"
          className="settings-button"
          onClick={() => void refreshCurrentView()}
          title="Refresh current view"
        >
          <RefreshCw className="settings-icon" aria-hidden="true" />
          <span className="visually-hidden">Refresh current view</span>
        </button>
        <button
          type="button"
          className="settings-button agent-toggle-button"
          aria-pressed={isAgentPanelOpen}
          onClick={() => setIsAgentPanelOpen((isOpen) => !isOpen)}
        >
          <MessageCircle className="settings-icon" aria-hidden="true" />
          <span className="visually-hidden">AI assistant</span>
        </button>
        <button
          type="button"
          className="settings-button"
          onClick={() => {
            setIsAgentPanelOpen(false);
            setPage("settings");
          }}
        >
          <SettingsIcon className="settings-icon" aria-hidden="true" />
          <span className="visually-hidden">Settings</span>
        </button>
      </header>
      {isAgentPanelOpen ? (
        <AgentChatPanel
          width={agentPanelWidth}
          providers={agentProviders}
          selectedProviderId={selectedAgentProviderId}
          messages={agentMessages}
          onWidthChange={resizeAgentPanel}
          onSelectedProviderChange={setSelectedAgentProvider}
          onMessagesChange={setAgentMessages}
          onSendMessage={gmailClient.sendAgentMessage}
        />
      ) : null}
    </main>
  );
}

function getStoredAgentProviderId(): AgentProviderId {
  const storedProviderId = localStorage.getItem(agentProviderStorageKey);
  return storedProviderId === "chatgpt-codex" || storedProviderId === "claude-code" ? storedProviderId : "claude-code";
}

function getStoredAgentPanelWidth(): number {
  const storedWidth = Number(localStorage.getItem(agentPanelWidthStorageKey));
  return Number.isFinite(storedWidth) && storedWidth >= 320 && storedWidth <= 560
    ? storedWidth
    : DEFAULT_AGENT_PANEL_WIDTH;
}
