# Claude Code Agent Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-side chat panel backed by the user's Claude Code Pro/Max subscription and expose connection management in Settings.

**Architecture:** Keep renderer UI state local, route Claude Code operations through Electron main IPC, and resize the Gmail WebContentsView with a right inset so the panel never overlaps Gmail. The first slice supports Claude Code status checks and single-turn chat through `claude -p`; Gmail tool execution is intentionally deferred to a later MCP/tool layer.

**Tech Stack:** Electron IPC, React, lucide-react, shadcn-style local components, Node `child_process.execFile`, Vitest, Playwright smoke test.

---

### Task 1: Renderer Contract And Layout Tests

**Files:**
- Modify: `tests/renderer/App.test.tsx`
- Modify: `src/renderer/api.ts`
- Modify: `src/preload/preload.ts`

- [x] Add failing renderer expectations for:
  - chat button next to settings
  - panel opens and calls `setGmailRightInset(width)`
  - panel closes and resets right inset to `0`
  - settings has an `AI 연결` section that displays Claude Code status

### Task 2: Gmail Right Inset

**Files:**
- Modify: `src/main/gmailViewController.ts`
- Modify: `src/main/ipc.ts`
- Modify: `tests/unit/gmailViewController.test.ts`

- [x] Add a right inset to Gmail bounds calculation.
- [x] Add IPC channel `appChrome:setGmailRightInset`.
- [x] Keep existing top inset and visibility behavior unchanged.

### Task 3: Claude Code Bridge

**Files:**
- Create: `src/main/claudeCodeBridge.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/createMainWindow.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/renderer/api.ts`

- [x] Add `claudeCode:getStatus` and `claudeCode:sendMessage` IPC channels.
- [x] Implement status via `claude auth status`.
- [x] Implement single-turn prompt via `claude -p --output-format json --max-turns 1`.
- [x] Return clear errors when `claude` is missing, logged out, or command execution fails.

### Task 4: Chat Panel UI

**Files:**
- Create: `src/renderer/components/AgentChatPanel.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`

- [x] Add a `MessageCircle` button beside Settings.
- [x] Add slide-in panel with compact Slack-like density.
- [x] Add resize handle with persisted width.
- [x] Add message input and response rendering.

### Task 5: Settings AI Connection UI

**Files:**
- Modify: `src/renderer/components/SettingsPage.tsx`
- Modify: `src/renderer/styles.css`

- [x] Add `AI 연결` navigation item.
- [x] Show Claude Code install/auth status.
- [x] Provide a refresh button and short login guidance.

### Task 6: Verification

**Files:**
- Modify tests as needed.

- [x] Run `npm test -- tests/renderer/App.test.tsx`.
- [x] Run `npm run typecheck`.
- [x] Run `npm test`.
- [x] Run `npm run test:e2e`.
- [x] Run `npm run dist:mac`.
- [x] Launch packaged app and verify panel/settings manually.
