import { useEffect, useState } from "react";
import { MessageCircle, RefreshCw, Settings as SettingsIcon } from "lucide-react";
import { gmailClient } from "./api";
import { AgentChatPanel } from "./components/AgentChatPanel";
import type { ChatMessage } from "./components/AgentChatPanel";
import { FirstRun } from "./components/FirstRun";
import { SettingsPage } from "./components/SettingsPage";
import { ProfileSwitcher } from "./components/ProfileSwitcher";
import { StatusBar } from "./components/StatusBar";
import type { ProfileState } from "../shared/profile";
import type { AgentProviderId, AgentProviderStatus } from "../shared/agent";

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

  async function switchProfile(profileId: string) {
    if (!profileId || profileId === state?.lastActiveProfileId) {
      return;
    }

    try {
      await gmailClient.switchProfile(profileId);
      await refreshState();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Unable to switch profile");
      await refreshState({ clearStatus: false }).catch(() => undefined);
    }
  }

  async function renameProfile(profileId: string, displayName: string) {
    await gmailClient.renameProfile(profileId, displayName);
    await refreshState();
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

  async function refreshGmailView() {
    try {
      await gmailClient.refreshGmailView();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Unable to refresh Gmail");
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
          activeProfileId={state.lastActiveProfileId}
          onSwitchProfile={switchProfile}
        />
        <StatusBar message={status} />
        <button
          type="button"
          className="settings-button"
          onClick={() => void refreshGmailView()}
          title="Refresh Gmail"
        >
          <RefreshCw className="settings-icon" aria-hidden="true" />
          <span className="visually-hidden">Refresh Gmail</span>
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
