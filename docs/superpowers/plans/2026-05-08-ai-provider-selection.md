# AI Provider Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ChatGPT/Codex as an AI connection alongside Claude Code and let the user choose the service in the chat panel.

**Architecture:** Introduce a provider registry in the main process with a shared provider status/request type. Renderer settings displays provider connection state and login actions; chat panel sends messages through the selected provider id.

**Tech Stack:** Electron IPC, React, TypeScript, Vitest, existing Claude Code CLI bridge, Codex CLI.

---

### Task 1: Shared Provider Contract

**Files:**
- Modify: `src/shared/agent.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/renderer/api.ts`

- [ ] Add `AgentProviderId`, `AgentProviderStatus`, and provider-aware `sendAgentMessage(providerId, message)` signatures.
- [ ] Keep existing `AgentChatResponse` and Gmail context types unchanged.
- [ ] Run `npm run typecheck` and expect failures until main/renderer implementations are updated.

### Task 2: Main Provider Registry

**Files:**
- Create: `src/main/agentProviderRegistry.ts`
- Modify: `src/main/claudeCodeBridge.ts`
- Modify: `src/main/ipc.ts`
- Test: `tests/unit/agentProviderRegistry.test.ts`

- [ ] Write tests that ChatGPT status is detected through `codex login status`.
- [ ] Write tests that `sendMessage("chatgpt-codex", ...)` invokes `codex exec` and reads `--output-last-message`.
- [ ] Implement provider registry with Claude Code and ChatGPT/Codex providers.
- [ ] Add IPC channels `agent:getProviders`, `agent:startProviderLogin`, and `agent:sendMessage`.

### Task 3: Settings Connection UI

**Files:**
- Modify: `src/renderer/components/SettingsPage.tsx`
- Modify: `src/renderer/styles.css`
- Test: `tests/renderer/App.test.tsx`

- [ ] Replace Claude-only status with a provider list.
- [ ] Show Claude Code and ChatGPT rows with connection state, detail text, refresh, and login start actions.
- [ ] Verify renderer tests cover ChatGPT connection visibility.

### Task 4: Chat Provider Selector

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/AgentChatPanel.tsx`
- Modify: `src/renderer/styles.css`
- Test: `tests/renderer/App.test.tsx`

- [ ] Add an AI service selector to chat panel header.
- [ ] Disable providers that are not authenticated.
- [ ] Persist selected provider in `localStorage`.
- [ ] Verify chat messages route through the selected provider id.

### Task 5: Verification

**Files:**
- All changed files

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run test:e2e`.
- [ ] Run `npm run dist:mac`.
