import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import type { AgentChatResponse, AgentProviderId, AgentProviderStatus, GmailPageContext } from "../shared/agent";
import { buildPrompt, createClaudeCodeBridge, runCommand } from "./claudeCodeBridge";
import type { ClaudeCodeBridge, CommandRunner } from "./claudeCodeBridge";

export interface AgentProviderRegistryOptions {
  codexHome?: string;
}

interface AgentProvider {
  id: AgentProviderId;
  name: string;
  description: string;
  loginCommand: string;
  getStatus(): Promise<AgentProviderStatus>;
  startLogin(): Promise<void>;
  sendMessage(message: string, context?: GmailPageContext | null): Promise<AgentChatResponse>;
}

export interface AgentProviderRegistry {
  getProviders(): Promise<AgentProviderStatus[]>;
  startProviderLogin(providerId: AgentProviderId): Promise<void>;
  sendMessage(
    providerId: AgentProviderId,
    message: string,
    context?: GmailPageContext | null
  ): Promise<AgentChatResponse>;
}

export function createAgentProviderRegistry(
  commandRunner: CommandRunner = runCommand,
  options: AgentProviderRegistryOptions = {}
): AgentProviderRegistry {
  const providers: AgentProvider[] = [
    new ClaudeCodeProvider(createClaudeCodeBridge(commandRunner), commandRunner),
    new CodexCliProvider(commandRunner, options)
  ];

  return new DefaultAgentProviderRegistry(providers);
}

class DefaultAgentProviderRegistry implements AgentProviderRegistry {
  constructor(private readonly providers: AgentProvider[]) {}

  async getProviders(): Promise<AgentProviderStatus[]> {
    return Promise.all(this.providers.map((provider) => provider.getStatus()));
  }

  async startProviderLogin(providerId: AgentProviderId): Promise<void> {
    await this.getProvider(providerId).startLogin();
  }

  async sendMessage(
    providerId: AgentProviderId,
    message: string,
    context?: GmailPageContext | null
  ): Promise<AgentChatResponse> {
    return this.getProvider(providerId).sendMessage(message, context);
  }

  private getProvider(providerId: AgentProviderId): AgentProvider {
    const provider = this.providers.find((candidate) => candidate.id === providerId);

    if (!provider) {
      throw new Error(`Unknown AI provider: ${providerId}`);
    }

    return provider;
  }
}

class ClaudeCodeProvider implements AgentProvider {
  readonly id = "claude-code" as const;
  readonly name = "Claude Code";
  readonly description = "Claude Pro / Max 구독 계정으로 로컬 CLI에 로그인해 사용합니다.";
  readonly loginCommand = "claude login";

  constructor(private readonly bridge: ClaudeCodeBridge, private readonly commandRunner: CommandRunner) {}

  async getStatus(): Promise<AgentProviderStatus> {
    const status = await this.bridge.getStatus();

    return {
      id: this.id,
      name: this.name,
      description: this.description,
      installed: status.installed,
      authenticated: status.authenticated,
      ...(status.version ? { version: status.version } : {}),
      detail: status.detail,
      loginCommand: this.loginCommand
    };
  }

  async startLogin(): Promise<void> {
    await openLoginTerminal(this.commandRunner, this.name, this.loginCommand);
  }

  async sendMessage(message: string, context?: GmailPageContext | null): Promise<AgentChatResponse> {
    return this.bridge.sendMessage(message, context);
  }
}

class CodexCliProvider implements AgentProvider {
  readonly id = "chatgpt-codex" as const;
  readonly name = "ChatGPT";
  readonly description = "ChatGPT Plus / Pro 계정으로 Codex CLI에 로그인해 사용합니다.";
  readonly loginCommand = "codex login";

  constructor(private readonly commandRunner: CommandRunner, private readonly options: AgentProviderRegistryOptions) {}

  async getStatus(): Promise<AgentProviderStatus> {
    const codexPath = await this.resolveCodexBinary();

    if (!codexPath) {
      return {
        id: this.id,
        name: this.name,
        description: this.description,
        installed: false,
        authenticated: false,
        detail: "Codex CLI를 찾지 못했습니다. Codex CLI를 설치한 뒤 ChatGPT 계정으로 로그인해 주세요.",
        loginCommand: this.loginCommand
      };
    }

    const version = await this.getVersion(codexPath);

    try {
      await this.ensureCodexHome();
      const result = await this.commandRunner(codexPath, ["login", "status"], this.commandOptions(8000));
      const detail = (result.stdout || result.stderr || "Codex CLI is ready").trim();

      return {
        id: this.id,
        name: this.name,
        description: this.description,
        installed: true,
        authenticated: /logged in/i.test(detail),
        ...(version ? { version } : {}),
        detail,
        loginCommand: this.loginCommand
      };
    } catch (error) {
      return {
        id: this.id,
        name: this.name,
        description: this.description,
        installed: true,
        authenticated: false,
        ...(version ? { version } : {}),
        detail: getCommandErrorMessage(error) || "`codex login`을 실행해 ChatGPT 계정으로 로그인해 주세요.",
        loginCommand: this.loginCommand
      };
    }
  }

  async startLogin(): Promise<void> {
    await this.ensureCodexHome();
    await openLoginTerminal(this.commandRunner, this.name, this.loginCommand, this.codexEnvironment());
  }

  async sendMessage(message: string, context?: GmailPageContext | null): Promise<AgentChatResponse> {
    const prompt = message.trim();

    if (!prompt) {
      throw new Error("message must not be empty");
    }

    const codexPath = await this.resolveCodexBinary();

    if (!codexPath) {
      throw new Error("Codex CLI를 찾지 못했습니다. 설정의 AI 연결에서 설치 상태를 확인해 주세요.");
    }

    const outputPath = join(tmpdir(), `gmail-client-codex-${randomUUID()}.txt`);
    await this.ensureCodexHome();

    let result;
    try {
      result = await this.commandRunner(
        codexPath,
        [
          "exec",
          "--skip-git-repo-check",
          "--sandbox",
          "read-only",
          "--color",
          "never",
          "--output-last-message",
          outputPath,
          buildCodexPrompt(prompt, context)
        ],
        this.commandOptions(120000)
      );
    } catch (error) {
      throw new Error(getCommandErrorMessage(error) || "Codex CLI 실행에 실패했습니다.");
    }

    const responseMessage = await readOutputFile(outputPath);

    return {
      message: responseMessage || result.stdout.trim() || "ChatGPT가 빈 응답을 반환했습니다."
    };
  }

  private async resolveCodexBinary(): Promise<string | null> {
    try {
      const result = await this.commandRunner("/bin/zsh", ["-lc", "command -v codex"], { timeoutMs: 5000 });
      return result.stdout.trim().split("\n")[0] || null;
    } catch {
      return null;
    }
  }

  private async getVersion(codexPath: string): Promise<string | undefined> {
    try {
      const result = await this.commandRunner(codexPath, ["--version"], { timeoutMs: 5000 });
      return (result.stdout || result.stderr).trim() || undefined;
    } catch {
      return undefined;
    }
  }

  private async ensureCodexHome(): Promise<void> {
    if (!this.options.codexHome) {
      return;
    }

    await mkdir(this.options.codexHome, { recursive: true });
  }

  private commandOptions(timeoutMs: number): { timeoutMs: number; env?: NodeJS.ProcessEnv } {
    const env = this.codexEnvironment();
    return env ? { timeoutMs, env } : { timeoutMs };
  }

  private codexEnvironment(): NodeJS.ProcessEnv | undefined {
    return this.options.codexHome ? { CODEX_HOME: this.options.codexHome } : undefined;
  }
}

async function openLoginTerminal(
  commandRunner: CommandRunner,
  providerName: string,
  loginCommand: string,
  environment: NodeJS.ProcessEnv = {}
): Promise<void> {
  const scriptDir = join(tmpdir(), "gmail-mac-client-login");
  const scriptPath = join(scriptDir, `${providerName.replace(/\W+/g, "-").toLowerCase()}-${randomUUID()}.command`);
  const environmentLines = Object.entries(environment).map(
    ([key, value]) => `export ${key}=${shellQuote(String(value))}`
  );
  const script = [
    "#!/bin/zsh",
    ...environmentLines,
    `echo '${providerName} 로그인 창입니다.'`,
    `echo '${loginCommand}를 실행합니다.'`,
    loginCommand,
    "echo ''",
    "echo '로그인이 끝났으면 Gmail Mac Client 설정에서 상태 새로고침을 눌러주세요.'",
    "read -k 1 '?아무 키나 누르면 이 창을 닫습니다.'"
  ].join("\n");

  await mkdir(scriptDir, { recursive: true });
  await writeFile(scriptPath, script, "utf8");
  await chmod(scriptPath, 0o755);
  await commandRunner("open", [scriptPath], { timeoutMs: 5000 });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function buildCodexPrompt(message: string, context?: GmailPageContext | null): string {
  return [
    "You are an email assistant inside a Gmail Mac client. Answer in Korean unless the user asks otherwise.",
    "This integration can discuss and plan Gmail actions, but it must not claim that it has directly changed Gmail.",
    "",
    buildPrompt(message, context)
  ].join("\n");
}

async function readOutputFile(path: string): Promise<string> {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch {
    return "";
  } finally {
    await unlink(path).catch(() => undefined);
  }
}

function getCommandErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return error instanceof Error ? error.message : "";
  }

  const record = error as Record<string, unknown>;
  const stderr = typeof record.stderr === "string" ? record.stderr.trim() : "";
  const stdout = typeof record.stdout === "string" ? record.stdout.trim() : "";

  return stderr || stdout || (error instanceof Error ? error.message : "");
}
