import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/renderer/App";
import type { ActiveGoogleSurface, GmailProfile, ProfileState } from "../../src/shared/profile";
import type { AgentProviderStatus, ClaudeCodeStatus } from "../../src/shared/agent";
import type { UpdateCheckResult } from "../../src/shared/update";

const workProfile: GmailProfile = {
  id: "profile_1",
  displayName: "Work",
  partition: "persist:gmail-profile-profile_1",
  email: "work.user@example.com",
  avatarUrl: "https://lh3.googleusercontent.com/a/work-avatar",
  calendarEnabled: false,
  createdAt: "2026-05-08T00:00:00.000Z",
  updatedAt: "2026-05-08T00:00:00.000Z"
};

const personalProfile: GmailProfile = {
  id: "profile_2",
  displayName: "Personal",
  partition: "persist:gmail-profile-profile_2",
  email: "personal.user@example.com",
  calendarEnabled: false,
  createdAt: "2026-05-08T00:00:00.000Z",
  updatedAt: "2026-05-08T00:00:00.000Z"
};

function makeProfile(overrides: Partial<GmailProfile> = {}): GmailProfile {
  return {
    id: "profile",
    displayName: "Profile",
    partition: "persist:gmail-profile-profile",
    calendarEnabled: false,
    createdAt: "2026-05-08T00:00:00.000Z",
    updatedAt: "2026-05-08T00:00:00.000Z",
    ...overrides
  };
}

type TestProfileState = Omit<ProfileState, "lastActiveSurface"> & Partial<Pick<ProfileState, "lastActiveSurface">>;

function normalizeTestProfileState(state: TestProfileState): ProfileState {
  return {
    ...state,
    lastActiveSurface:
      state.lastActiveSurface ?? (state.lastActiveProfileId ? { profileId: state.lastActiveProfileId, appKind: "mail" } : null)
  };
}

function installApi(state: TestProfileState) {
  let currentState = normalizeTestProfileState(state);
  let profilesChangedCallback: (() => void) | null = null;
  const claudeStatus: ClaudeCodeStatus = {
    installed: true,
    authenticated: true,
    version: "1.0.0",
    detail: "Claude Code is ready"
  };
  const agentProviders: AgentProviderStatus[] = [
    {
      id: "claude-code",
      name: "Claude Code",
      description: "Claude Pro / Max 구독 계정으로 로컬 CLI에 로그인해 사용합니다.",
      installed: true,
      authenticated: true,
      version: "1.0.0",
      detail: "Claude Code is ready",
      loginCommand: "claude login"
    },
    {
      id: "chatgpt-codex",
      name: "ChatGPT",
      description: "ChatGPT Plus / Pro 계정으로 Codex CLI에 로그인해 사용합니다.",
      installed: true,
      authenticated: true,
      version: "codex-cli 0.129.0",
      detail: "Logged in using ChatGPT",
      loginCommand: "codex login"
    }
  ];
  const noUpdate: UpdateCheckResult = {
    available: false,
    currentVersion: "0.1.1",
    latestVersion: "0.1.1"
  };
  const api = {
    getProfileState: vi.fn().mockImplementation(() => Promise.resolve(currentState)),
    createProfile: vi.fn().mockImplementation((displayName: string) => {
      const profile = { ...workProfile, displayName: displayName.trim() };
      currentState = normalizeTestProfileState({ profiles: [profile], lastActiveProfileId: profile.id });
      return Promise.resolve(profile);
    }),
    renameProfile: vi.fn().mockResolvedValue(workProfile),
    updateProfileEmail: vi.fn().mockImplementation((profileId: string, email: string) => {
      currentState = normalizeTestProfileState({
        ...currentState,
        profiles: currentState.profiles.map((profile) => (profile.id === profileId ? { ...profile, email } : profile))
      });
      return Promise.resolve(currentState.profiles.find((profile) => profile.id === profileId));
    }),
    deleteProfile: vi.fn().mockResolvedValue(undefined),
    switchSurface: vi.fn().mockImplementation((surface: ActiveGoogleSurface) => {
      currentState = normalizeTestProfileState({
        ...currentState,
        lastActiveProfileId: surface.profileId,
        lastActiveSurface: surface
      });
      return Promise.resolve();
    }),
    refreshCurrentSurface: vi.fn().mockResolvedValue(undefined),
    checkForUpdate: vi.fn().mockResolvedValue(noUpdate),
    downloadAndOpenUpdate: vi.fn().mockResolvedValue({
      downloadedPath: "/Users/test/Downloads/Simple.Gmail.Client-0.1.2-arm64.dmg",
      update: {
        available: true,
        currentVersion: "0.1.1",
        latestVersion: "0.1.2",
        releaseUrl: "https://github.com/gr8woo/gmail-mac-client/releases/tag/v0.1.2",
        assetName: "Simple.Gmail.Client-0.1.2-arm64.dmg",
        downloadUrl:
          "https://github.com/gr8woo/gmail-mac-client/releases/download/v0.1.2/Simple.Gmail.Client-0.1.2-arm64.dmg",
        publishedAt: "2026-06-01T02:14:49Z"
      }
    }),
    setProfileCalendarEnabled: vi.fn().mockImplementation((profileId: string, enabled: boolean) => {
      currentState = normalizeTestProfileState({
        ...currentState,
        profiles: currentState.profiles.map((profile) =>
          profile.id === profileId ? { ...profile, calendarEnabled: enabled } : profile
        )
      });
      return Promise.resolve(currentState.profiles.find((profile) => profile.id === profileId));
    }),
    setChromeHeight: vi.fn().mockResolvedValue(undefined),
    setGmailViewVisible: vi.fn().mockResolvedValue(undefined),
    setGmailRightInset: vi.fn().mockResolvedValue(undefined),
    getClaudeCodeStatus: vi.fn().mockResolvedValue(claudeStatus),
    getAgentProviders: vi.fn().mockResolvedValue(agentProviders),
    startAgentProviderLogin: vi.fn().mockResolvedValue(undefined),
    sendAgentMessage: vi.fn().mockResolvedValue({ message: "메일을 확인해볼게요." }),
    onProfilesChanged: vi.fn().mockImplementation((callback: () => void) => {
      profilesChangedCallback = callback;
      return () => {
        profilesChangedCallback = null;
      };
    }),
    emitProfilesChanged(nextState: TestProfileState) {
      currentState = normalizeTestProfileState(nextState);
      profilesChangedCallback?.();
    }
  };

  Object.defineProperty(window, "gmailClient", {
    value: api,
    configurable: true
  });

  return api;
}

describe("App", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("shows first-run profile creation when no profiles exist", async () => {
    installApi({ profiles: [], lastActiveProfileId: null });

    render(<App />);

    expect(await screen.findByText("Create your first Gmail profile")).toBeInTheDocument();
  });

  it("creates the first profile with a trimmed name", async () => {
    const api = installApi({ profiles: [], lastActiveProfileId: null });

    render(<App />);

    fireEvent.change(await screen.findByLabelText("Profile name"), { target: { value: "  Work  " } });
    fireEvent.click(screen.getByRole("button", { name: "Create profile" }));

    await waitFor(() => expect(api.createProfile).toHaveBeenCalledWith("Work"));
  });

  it("shows circular profile buttons instead of the legacy dropdown", async () => {
    installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile, personalProfile]
    });

    render(<App />);

    expect(await screen.findByRole("button", { name: "Switch to work.user@example.com Gmail" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to personal.user@example.com Gmail" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Current profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage profiles" })).not.toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveClass("app-bar");
  });

  it("switches profiles directly from a profile image button", async () => {
    const api = installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile, personalProfile]
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Switch to personal.user@example.com Gmail" }));

    await waitFor(() => expect(api.switchSurface).toHaveBeenCalledWith({ profileId: "profile_2", appKind: "mail" }));
  });

  it("shows calendar profile buttons only for calendar-enabled profiles", async () => {
    installApi({
      profiles: [
        makeProfile({ id: "work", displayName: "Work", partition: "persist:gmail-profile-work", calendarEnabled: true }),
        makeProfile({
          id: "personal",
          displayName: "Personal",
          partition: "persist:gmail-profile-personal",
          calendarEnabled: false
        })
      ],
      lastActiveProfileId: "work",
      lastActiveSurface: { profileId: "work", appKind: "mail" }
    });

    render(<App />);

    expect(await screen.findByRole("button", { name: "Switch to Work Gmail" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Switch to Work Calendar" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Switch to Personal Gmail" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Switch to Personal Calendar" })).not.toBeInTheDocument();
  });

  it("switches to the selected calendar surface and marks it active", async () => {
    const api = installApi({
      profiles: [
        makeProfile({ id: "work", displayName: "Work", partition: "persist:gmail-profile-work", calendarEnabled: true })
      ],
      lastActiveProfileId: "work",
      lastActiveSurface: { profileId: "work", appKind: "mail" }
    });

    render(<App />);
    const gmailButton = await screen.findByRole("button", { name: "Switch to Work Gmail" });
    const calendarButton = screen.getByRole("button", { name: "Switch to Work Calendar" });

    expect(gmailButton).toHaveAttribute("aria-current", "page");
    expect(calendarButton).not.toHaveAttribute("aria-current");

    fireEvent.click(calendarButton);

    await waitFor(() => {
      expect(api.switchSurface).toHaveBeenCalledWith({ profileId: "work", appKind: "calendar" });
    });
    await waitFor(() => expect(calendarButton).toHaveAttribute("aria-current", "page"));
    expect(gmailButton).not.toHaveAttribute("aria-current");
  });

  it("refreshes the current view from the app bar", async () => {
    const api = installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile]
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh current view" }));

    await waitFor(() => expect(api.refreshCurrentSurface).toHaveBeenCalled());
  });

  it("shows an update button when a newer release is available", async () => {
    const api = installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile]
    });
    api.checkForUpdate.mockResolvedValueOnce({
      available: true,
      currentVersion: "0.1.1",
      latestVersion: "0.1.2",
      releaseUrl: "https://github.com/gr8woo/gmail-mac-client/releases/tag/v0.1.2",
      assetName: "Simple.Gmail.Client-0.1.2-arm64.dmg",
      downloadUrl:
        "https://github.com/gr8woo/gmail-mac-client/releases/download/v0.1.2/Simple.Gmail.Client-0.1.2-arm64.dmg",
      publishedAt: "2026-06-01T02:14:49Z"
    });

    render(<App />);

    expect(await screen.findByRole("button", { name: "Install update 0.1.2" })).toBeInTheDocument();
  });

  it("downloads and opens the update from the app bar", async () => {
    const api = installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile]
    });
    api.checkForUpdate.mockResolvedValueOnce({
      available: true,
      currentVersion: "0.1.1",
      latestVersion: "0.1.2",
      releaseUrl: "https://github.com/gr8woo/gmail-mac-client/releases/tag/v0.1.2",
      assetName: "Simple.Gmail.Client-0.1.2-arm64.dmg",
      downloadUrl:
        "https://github.com/gr8woo/gmail-mac-client/releases/download/v0.1.2/Simple.Gmail.Client-0.1.2-arm64.dmg",
      publishedAt: "2026-06-01T02:14:49Z"
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Install update 0.1.2" }));

    await waitFor(() => expect(api.downloadAndOpenUpdate).toHaveBeenCalled());
    expect(await screen.findByRole("status")).toHaveTextContent("Update 0.1.2 opened. Quit this app before installing.");
  });

  it("navigates to a settings page and hides the Gmail view", async () => {
    const api = installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile, personalProfile]
    });

    render(<App />);

    const settingsButton = await screen.findByRole("button", { name: "Settings" });
    expect(settingsButton.querySelector(".settings-icon")).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(settingsButton);

    expect(await screen.findByRole("main", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "계정" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "테마" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI 연결" })).toBeInTheDocument();
    expect(screen.getByText("메일 계정")).toBeInTheDocument();
    expect(screen.getByText("work.user@example.com")).toBeInTheDocument();
    expect(screen.getByText("personal.user@example.com")).toBeInTheDocument();
    expect(screen.getByText("기본값")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "계정 추가" })).toBeInTheDocument();
    expect(screen.getByLabelText("Profile management")).toHaveAttribute("tabindex", "0");
    await waitFor(() => expect(api.setGmailViewVisible).toHaveBeenCalledWith(false));

    fireEvent.click(screen.getByRole("button", { name: "메일로 돌아가기" }));

    await waitFor(() => expect(api.setGmailViewVisible).toHaveBeenLastCalledWith(true));
  });

  it("does not rename to an unchanged or blank profile name", async () => {
    const api = installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile]
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.blur(screen.getByLabelText("Rename Work"), { target: { value: "  Work  " } });
    fireEvent.change(screen.getByLabelText("Rename Work"), { target: { value: "   " } });
    fireEvent.blur(screen.getByLabelText("Rename Work"));

    expect(api.renameProfile).not.toHaveBeenCalled();
  });

  it("updates a profile email from settings", async () => {
    const api = installApi({
      lastActiveProfileId: "profile_2",
      profiles: [personalProfile]
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.change(screen.getByLabelText("Email for Personal"), { target: { value: "new@example.com" } });
    fireEvent.blur(screen.getByLabelText("Email for Personal"));

    await waitFor(() => {
      expect(api.updateProfileEmail).toHaveBeenCalledWith("profile_2", "new@example.com");
    });
  });

  it("disables adding a profile after five profiles", async () => {
    installApi({
      lastActiveProfileId: "profile_1",
      profiles: Array.from({ length: 5 }, (_, index) => ({
        ...workProfile,
        id: `profile_${index + 1}`,
        displayName: `Profile ${index + 1}`,
        partition: `persist:gmail-profile-profile_${index + 1}`
      }))
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));

    expect(screen.getByRole("button", { name: "계정 추가" })).toBeDisabled();
    expect(screen.getByText("5 / 5")).toBeInTheDocument();
  });

  it("confirms before deleting a profile", async () => {
    const api = installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile]
    });
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Work" }));

    expect(window.confirm).toHaveBeenCalledWith("Delete this profile and its local Gmail session data?");
    expect(api.deleteProfile).not.toHaveBeenCalled();
  });

  it("lets the user choose system, light, or dark theme from settings", async () => {
    installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile]
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "테마" }));

    expect(screen.getByRole("button", { name: "시스템" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "어둡게" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem("gmail-client-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "어둡게" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "밝게" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("enables calendar from profile settings", async () => {
    const api = installApi({
      profiles: [makeProfile({ id: "work", displayName: "Work", calendarEnabled: false })],
      lastActiveProfileId: "work",
      lastActiveSurface: { profileId: "work", appKind: "mail" }
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("switch", { name: "Enable Calendar for Work" }));

    await waitFor(() => {
      expect(api.setProfileCalendarEnabled).toHaveBeenCalledWith("work", true);
    });
  });

  it("switches back to mail when disabling the active calendar profile", async () => {
    const api = installApi({
      profiles: [makeProfile({ id: "work", displayName: "Work", calendarEnabled: true })],
      lastActiveProfileId: "work",
      lastActiveSurface: { profileId: "work", appKind: "calendar" }
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("switch", { name: "Enable Calendar for Work" }));

    await waitFor(() => {
      expect(api.setProfileCalendarEnabled).toHaveBeenCalledWith("work", false);
    });
  });

  it("opens and closes the agent chat panel while reserving Gmail width", async () => {
    const api = installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile, personalProfile]
    });

    render(<App />);

    const agentButton = await screen.findByRole("button", { name: "AI assistant" });
    fireEvent.click(agentButton);

    expect(await screen.findByRole("complementary", { name: "AI assistant" })).toBeInTheDocument();
    await waitFor(() => expect(api.setGmailRightInset).toHaveBeenCalledWith(360));

    fireEvent.click(agentButton);

    await waitFor(() => expect(api.setGmailRightInset).toHaveBeenLastCalledWith(0));
  });

  it("sends chat messages through the selected AI provider", async () => {
    const api = installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile]
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "AI assistant" }));
    fireEvent.change(screen.getByLabelText("AI message"), { target: { value: "오늘 중요한 메일 요약해줘" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(api.sendAgentMessage).toHaveBeenCalledWith("claude-code", "오늘 중요한 메일 요약해줘"));
    expect(await screen.findByText("메일을 확인해볼게요.")).toBeInTheDocument();
  });

  it("lets the user choose ChatGPT in the chat panel", async () => {
    const api = installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile]
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "AI assistant" }));
    await screen.findByRole("option", { name: "ChatGPT" });
    fireEvent.change(await screen.findByLabelText("AI service"), { target: { value: "chatgpt-codex" } });
    fireEvent.change(screen.getByLabelText("AI message"), { target: { value: "ChatGPT로 요약해줘" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(api.sendAgentMessage).toHaveBeenCalledWith("chatgpt-codex", "ChatGPT로 요약해줘"));
    expect(localStorage.getItem("gmail-client-agent-provider")).toBe("chatgpt-codex");
  });

  it("renders assistant markdown as formatted chat content", async () => {
    const api = installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile]
    });
    api.sendAgentMessage.mockResolvedValueOnce({
      message: "**요약**\n\n- 첫째\n- 둘째\n\n[원문](https://example.com)"
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "AI assistant" }));
    fireEvent.change(screen.getByLabelText("AI message"), { target: { value: "마크다운으로 요약해줘" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("요약", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "원문" })).toHaveAttribute("href", "https://example.com");
    expect(screen.queryByText("**요약**")).not.toBeInTheDocument();
  });

  it("sends chat messages with Enter and keeps Shift+Enter for line breaks", async () => {
    const api = installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile]
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "AI assistant" }));
    const input = screen.getByLabelText("AI message");
    fireEvent.change(input, { target: { value: "현재 메일 요약" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    expect(api.sendAgentMessage).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(api.sendAgentMessage).toHaveBeenCalledWith("claude-code", "현재 메일 요약"));
  });

  it("keeps chat history when the panel is closed and reopened", async () => {
    installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile]
    });

    render(<App />);

    const agentButton = await screen.findByRole("button", { name: "AI assistant" });
    fireEvent.click(agentButton);
    fireEvent.change(screen.getByLabelText("AI message"), { target: { value: "긴 메일 요약해줘" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("긴 메일 요약해줘")).toBeInTheDocument();
    expect(await screen.findByText("메일을 확인해볼게요.")).toBeInTheDocument();

    fireEvent.click(agentButton);
    expect(screen.queryByRole("complementary", { name: "AI assistant" })).not.toBeInTheDocument();

    fireEvent.click(agentButton);
    expect(await screen.findByText("긴 메일 요약해줘")).toBeInTheDocument();
    expect(screen.getByText("메일을 확인해볼게요.")).toBeInTheDocument();
  });

  it("scrolls to the newest chat message after sending", async () => {
    const api = installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile]
    });
    const scrollIntoView = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "AI assistant" }));
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    scrollIntoView.mockClear();

    fireEvent.change(screen.getByLabelText("AI message"), { target: { value: "최신 대화로 이동해줘" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(api.sendAgentMessage).toHaveBeenCalledWith("claude-code", "최신 대화로 이동해줘"));
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "end" }));
  });

  it("shows AI provider connection management in settings", async () => {
    const api = installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile]
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "AI 연결" }));

    expect(await screen.findByText("Claude Code")).toBeInTheDocument();
    expect(await screen.findByText("ChatGPT")).toBeInTheDocument();
    expect(await screen.findAllByText("연결됨")).toHaveLength(2);
    expect(screen.getByText("codex login")).toBeInTheDocument();
    expect(api.getAgentProviders).toHaveBeenCalled();
  });

  it("surfaces switch profile failures without an unhandled rejection", async () => {
    const api = installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile, personalProfile]
    });
    api.switchSurface.mockRejectedValueOnce(new Error("Switch failed"));

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Switch to personal.user@example.com Gmail" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Switch failed");
  });

  it("surfaces delete profile failures after confirmation", async () => {
    const api = installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile]
    });
    api.deleteProfile.mockRejectedValueOnce(new Error("Delete failed"));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Work" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Delete failed");
  });

  it("refreshes profile buttons when the main process reports profile metadata changes", async () => {
    const { email: _email, avatarUrl: _avatarUrl, ...workProfileWithoutMetadata } = workProfile;
    const api = installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfileWithoutMetadata]
    });

    render(<App />);

    expect(await screen.findByRole("button", { name: "Switch to Work Gmail" })).toHaveTextContent("W");

    api.emitProfilesChanged({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile]
    });

    expect(await screen.findByRole("button", { name: "Switch to work.user@example.com Gmail" })).toBeInTheDocument();
  });
});
