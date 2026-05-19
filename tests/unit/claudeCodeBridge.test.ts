import { describe, expect, it, vi } from "vitest";
import { createClaudeCodeBridge } from "../../src/main/claudeCodeBridge";

describe("createClaudeCodeBridge", () => {
  it("reports a connected Claude Code CLI when auth status succeeds", async () => {
    const runner = vi.fn().mockImplementation((file: string, args: string[]) => {
      if (file === "/bin/zsh") {
        return Promise.resolve({ stdout: "/opt/homebrew/bin/claude\n", stderr: "" });
      }

      if (args[0] === "--version") {
        return Promise.resolve({ stdout: "1.2.3\n", stderr: "" });
      }

      return Promise.resolve({ stdout: "Logged in as gr8woo\n", stderr: "" });
    });

    await expect(createClaudeCodeBridge(runner).getStatus()).resolves.toEqual({
      installed: true,
      authenticated: true,
      version: "1.2.3",
      detail: "Logged in as gr8woo"
    });
  });

  it("reports missing Claude Code CLI when the binary cannot be resolved", async () => {
    const runner = vi.fn().mockRejectedValue(new Error("not found"));

    await expect(createClaudeCodeBridge(runner).getStatus()).resolves.toMatchObject({
      installed: false,
      authenticated: false
    });
  });

  it("returns a single-turn Claude Code response", async () => {
    let prompt = "";
    const runner = vi.fn().mockImplementation((file: string, args: string[]) => {
      if (file === "/bin/zsh") {
        return Promise.resolve({ stdout: "/opt/homebrew/bin/claude\n", stderr: "" });
      }

      expect(args).toContain("-p");
      expect(args).toContain("--output-format");
      prompt = args.at(-1) ?? "";
      return Promise.resolve({ stdout: JSON.stringify({ result: "요약해드릴게요." }), stderr: "" });
    });

    await expect(
      createClaudeCodeBridge(runner).sendMessage("메일 요약", {
        title: "Gmail",
        url: "https://mail.google.com/mail/u/0/#inbox/FMfcgz",
        subject: "분기 리뷰",
        sender: "boss@example.com",
        body: "이번 분기 리뷰 내용을 공유합니다."
      })
    ).resolves.toEqual({
      message: "요약해드릴게요."
    });
    expect(prompt).toContain("현재 Gmail 화면 컨텍스트");
    expect(prompt).toContain("분기 리뷰");
    expect(prompt).toContain("이번 분기 리뷰 내용을 공유합니다.");
  });
});
