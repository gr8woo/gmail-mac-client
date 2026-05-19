import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/renderer/App";
import type { GmailProfile, ProfileState } from "../../src/shared/profile";
import type { AgentProviderStatus, ClaudeCodeStatus } from "../../src/shared/agent";

const workProfile: GmailProfile = {
  id: "profile_1",
  displayName: "Work",
  partition: "persist:gmail-profile-profile_1",
  email: "gr8woo@zigbang.com",
  avatarUrl: "https://lh3.googleusercontent.com/a/work-avatar",
  calendarEnabled: false,
  createdAt: "2026-05-08T00:00:00.000Z",
  updatedAt: "2026-05-08T00:00:00.000Z"
};

const personalProfile: GmailProfile = {
  id: "profile_2",
  displayName: "Personal",
  partition: "persist:gmail-profile-profile_2",
  email: "gr8wooya@gmail.com",
  calendarEnabled: false,
  createdAt: "2026-05-08T00:00:00.000Z",
  updatedAt: "2026-05-08T00:00:00.000Z"
};

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
  const api = {
    getProfileState: vi.fn().mockImplementation(() => Promise.resolve(currentState)),
    createProfile: vi.fn().mockImplementation((displayName: string) => {
      const profile = { ...workProfile, displayName: displayName.trim() };
      currentState = normalizeTestProfileState({ profiles: [profile], lastActiveProfileId: profile.id });
      return Promise.resolve(profile);
    }),
    renameProfile: vi.fn().mockResolvedValue(workProfile),
    deleteProfile: vi.fn().mockResolvedValue(undefined),
    switchProfile: vi.fn().mockResolvedValue(undefined),
    refreshGmailView: vi.fn().mockResolvedValue(undefined),
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

    expect(await screen.findByRole("button", { name: "Switch to gr8woo@zigbang.com" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to gr8wooya@gmail.com" })).toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole("button", { name: "Switch to gr8wooya@gmail.com" }));

    await waitFor(() => expect(api.switchProfile).toHaveBeenCalledWith("profile_2"));
  });

  it("refreshes the current Gmail view from the app bar", async () => {
    const api = installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile]
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh Gmail" }));

    await waitFor(() => expect(api.refreshGmailView).toHaveBeenCalled());
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
    expect(screen.getByText("gr8woo@zigbang.com")).toBeInTheDocument();
    expect(screen.getByText("gr8wooya@gmail.com")).toBeInTheDocument();
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
    api.switchProfile.mockRejectedValueOnce(new Error("Switch failed"));

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Switch to gr8wooya@gmail.com" }));

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

    expect(await screen.findByRole("button", { name: "Switch to Work" })).toHaveTextContent("W");

    api.emitProfilesChanged({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile]
    });

    expect(await screen.findByRole("button", { name: "Switch to gr8woo@zigbang.com" })).toBeInTheDocument();
  });
});
