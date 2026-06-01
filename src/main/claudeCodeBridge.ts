import { execFile } from "node:child_process";

import type { AgentChatResponse, ClaudeCodeStatus, GmailPageContext } from "../shared/agent";

export interface ClaudeCodeBridge {
  getStatus(): Promise<ClaudeCodeStatus>;
  sendMessage(message: string, context?: GmailPageContext | null): Promise<AgentChatResponse>;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface CommandOptions {
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export type CommandRunner = (file: string, args: string[], options?: CommandOptions) => Promise<CommandResult>;

const assistantSystemPrompt =
  "You are an email assistant inside a Gmail Mac client. Answer in Korean unless the user asks otherwise. " +
  "This first integration can discuss and plan Gmail actions, but it must not claim that it has directly changed Gmail.";

export function createClaudeCodeBridge(commandRunner: CommandRunner = runCommand): ClaudeCodeBridge {
  return new LocalClaudeCodeBridge(commandRunner);
}

class LocalClaudeCodeBridge implements ClaudeCodeBridge {
  constructor(private readonly commandRunner: CommandRunner) {}

  async getStatus(): Promise<ClaudeCodeStatus> {
    const claudePath = await this.resolveClaudeBinary();

    if (!claudePath) {
      return {
        installed: false,
        authenticated: false,
        detail: "Claude Code CLI를 찾지 못했습니다. 터미널에서 Claude Code를 설치하고 로그인해 주세요."
      };
    }

    const version = await this.getVersion(claudePath);

    try {
      const result = await this.commandRunner(claudePath, ["auth", "status"], { timeoutMs: 8000 });
      return {
        installed: true,
        authenticated: true,
        ...(version ? { version } : {}),
        detail: (result.stdout || result.stderr || "Claude Code is ready").trim()
      };
    } catch (error) {
      return {
        installed: true,
        authenticated: false,
        ...(version ? { version } : {}),
        detail: getCommandErrorMessage(error) || "터미널에서 `claude login`을 실행해 로그인해 주세요."
      };
    }
  }

  async sendMessage(message: string, context?: GmailPageContext | null): Promise<AgentChatResponse> {
    const prompt = message.trim();

    if (!prompt) {
      throw new Error("message must not be empty");
    }

    const claudePath = await this.resolveClaudeBinary();

    if (!claudePath) {
      throw new Error("Claude Code CLI를 찾지 못했습니다. 설정의 AI 연결에서 설치 상태를 확인해 주세요.");
    }

    const result = await this.commandRunner(
      claudePath,
      [
        "-p",
        "--output-format",
        "json",
        "--max-turns",
        "1",
        "--append-system-prompt",
        assistantSystemPrompt,
        buildPrompt(prompt, context)
      ],
      { timeoutMs: 120000 }
    );
    const responseMessage = extractClaudeMessage(result.stdout);

    return {
      message: responseMessage || "Claude Code가 빈 응답을 반환했습니다."
    };
  }

  private async resolveClaudeBinary(): Promise<string | null> {
    try {
      const result = await this.commandRunner("/bin/zsh", ["-lc", "command -v claude"], { timeoutMs: 5000 });
      return result.stdout.trim().split("\n")[0] || null;
    } catch {
      return null;
    }
  }

  private async getVersion(claudePath: string): Promise<string | undefined> {
    try {
      const result = await this.commandRunner(claudePath, ["--version"], { timeoutMs: 5000 });
      return (result.stdout || result.stderr).trim() || undefined;
    } catch {
      return undefined;
    }
  }
}

export function buildPrompt(message: string, context?: GmailPageContext | null): string {
  if (!context) {
    return message;
  }

  const contextLines = [
    "현재 Gmail 화면 컨텍스트:",
    `- 제목: ${context.title || "(없음)"}`,
    `- URL: ${context.url || "(없음)"}`,
    context.subject ? `- 메일 제목: ${context.subject}` : "",
    context.sender ? `- 보낸 사람: ${context.sender}` : "",
    context.body ? `- 메일 내용:\n${context.body}` : ""
  ].filter(Boolean);

  return `${contextLines.join("\n")}\n\n사용자 요청:\n${message}`;
}

export function runCommand(file: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        timeout: options.timeoutMs ?? 30000,
        maxBuffer: 1024 * 1024 * 4,
        env: {
          ...process.env,
          ...options.env,
          TERM: options.env?.TERM || process.env.TERM || "xterm-256color"
        }
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stdout, stderr }));
          return;
        }

        resolve({ stdout, stderr });
      }
    );
  });
}

function extractClaudeMessage(stdout: string): string {
  const trimmed = stdout.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return readClaudeResult(parsed);
  } catch {
    return trimmed;
  }
}

function readClaudeResult(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;
  const directResult = record.result ?? record.message ?? record.response;

  if (typeof directResult === "string") {
    return directResult.trim();
  }

  if (Array.isArray(record.content)) {
    return record.content
      .map((item) => {
        if (!item || typeof item !== "object") {
          return "";
        }

        const contentRecord = item as Record<string, unknown>;
        return typeof contentRecord.text === "string" ? contentRecord.text : "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return "";
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
