import { writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { createAgentProviderRegistry } from "../../src/main/agentProviderRegistry";
import type { CommandRunner } from "../../src/main/claudeCodeBridge";

describe("agentProviderRegistry", () => {
  it("reports ChatGPT as connected when Codex CLI is logged in with ChatGPT", async () => {
    const commandRunner = vi.fn<CommandRunner>().mockImplementation(async (file, args) => {
      if (file === "/bin/zsh" && args.join(" ") === "-lc command -v claude") {
        return { stdout: "", stderr: "" };
      }

      if (file === "/bin/zsh" && args.join(" ") === "-lc command -v codex") {
        return { stdout: "/opt/homebrew/bin/codex\n", stderr: "" };
      }

      if (file === "/opt/homebrew/bin/codex" && args[0] === "--version") {
        return { stdout: "codex-cli 0.129.0", stderr: "" };
      }

      if (file === "/opt/homebrew/bin/codex" && args.join(" ") === "login status") {
        return { stdout: "Logged in using ChatGPT", stderr: "" };
      }

      throw new Error(`Unexpected command: ${file} ${args.join(" ")}`);
    });

    const providers = await createAgentProviderRegistry(commandRunner).getProviders();

    expect(providers).toContainEqual(
      expect.objectContaining({
        id: "chatgpt-codex",
        name: "ChatGPT",
        installed: true,
        authenticated: true,
        version: "codex-cli 0.129.0"
      })
    );
  });

  it("routes ChatGPT messages through codex exec and reads the final message file", async () => {
    const commandRunner = vi.fn<CommandRunner>().mockImplementation(async (file, args) => {
      if (file === "/bin/zsh" && args.join(" ") === "-lc command -v codex") {
        return { stdout: "/opt/homebrew/bin/codex\n", stderr: "" };
      }

      if (file === "/opt/homebrew/bin/codex" && args[0] === "exec") {
        const outputPath = args[args.indexOf("--output-last-message") + 1];
        if (!outputPath) {
          throw new Error("Missing --output-last-message path");
        }
        await writeFile(outputPath, "현재 메일 요약입니다.", "utf8");
        return { stdout: "codex logs", stderr: "" };
      }

      throw new Error(`Unexpected command: ${file} ${args.join(" ")}`);
    });

    const response = await createAgentProviderRegistry(commandRunner, {
      codexHome: "/tmp/gmail-codex-home"
    }).sendMessage("chatgpt-codex", "요약해줘", {
      title: "Gmail",
      url: "https://mail.google.com",
      subject: "회의 안내",
      body: "내일 오전 10시에 회의가 있습니다."
    });

    expect(response.message).toBe("현재 메일 요약입니다.");
    expect(commandRunner).toHaveBeenCalledWith(
      "/opt/homebrew/bin/codex",
      expect.arrayContaining(["exec", "--sandbox", "read-only"]),
      { timeoutMs: 120000, env: { CODEX_HOME: "/tmp/gmail-codex-home" } }
    );
    const codexCall = commandRunner.mock.calls.find(
      ([file, args]) => file === "/opt/homebrew/bin/codex" && args[0] === "exec"
    );
    expect(codexCall?.[1].join("\n")).toContain("회의 안내");
  });

  it("surfaces Codex CLI stderr when ChatGPT messages fail", async () => {
    const commandRunner = vi.fn<CommandRunner>().mockImplementation(async (file, args) => {
      if (file === "/bin/zsh" && args.join(" ") === "-lc command -v codex") {
        return { stdout: "/opt/homebrew/bin/codex\n", stderr: "" };
      }

      if (file === "/opt/homebrew/bin/codex" && args[0] === "exec") {
        throw Object.assign(new Error("Command failed: codex exec"), {
          stdout: "",
          stderr: "Error: failed to initialize in-process app-server client"
        });
      }

      throw new Error(`Unexpected command: ${file} ${args.join(" ")}`);
    });

    await expect(
      createAgentProviderRegistry(commandRunner).sendMessage("chatgpt-codex", "요약해줘")
    ).rejects.toThrow("failed to initialize in-process app-server client");
  });
});
