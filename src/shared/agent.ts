export type AgentProviderId = "claude-code" | "chatgpt-codex";

export interface AgentProviderStatus {
  id: AgentProviderId;
  name: string;
  description: string;
  installed: boolean;
  authenticated: boolean;
  version?: string;
  detail: string;
  loginCommand: string;
}

export interface ClaudeCodeStatus {
  installed: boolean;
  authenticated: boolean;
  version?: string;
  detail: string;
}

export interface AgentChatResponse {
  message: string;
}

export interface GmailPageContext {
  title: string;
  url: string;
  subject?: string;
  sender?: string;
  body?: string;
}
