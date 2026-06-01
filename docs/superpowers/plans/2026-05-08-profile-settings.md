# Profile Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the main profile dropdown with circular profile buttons, move profile management into Settings, enforce a five-profile limit, and persist Gmail account metadata for thumbnails.

**Architecture:** The renderer owns the top chrome UI and asks the main process to resize the Gmail `WebContentsView` top inset when Settings opens. Profile metadata remains in `FileProfileStore`; `GmailViewController` extracts email/avatar hints from Gmail after navigation and notifies the renderer through IPC state-change events.

**Tech Stack:** Electron, React, TypeScript, Vitest, Testing Library, Playwright smoke tests.

---

### Task 1: Profile Model And Store

**Files:**
- Modify: `src/shared/profile.ts`
- Modify: `src/main/profileStore.ts`
- Test: `tests/unit/profile.test.ts`
- Test: `tests/unit/profileStore.test.ts`

- [ ] Add optional `email` and `avatarUrl` metadata to `GmailProfile`.
- [ ] Export `MAX_PROFILES = 5`.
- [ ] Add store tests for preserving optional metadata, updating metadata, and rejecting a sixth profile.
- [ ] Implement `updateProfileMetadata(profileId, metadata, now)`.
- [ ] Run: `npm test -- tests/unit/profile.test.ts tests/unit/profileStore.test.ts`

### Task 2: Gmail View Chrome Height And Metadata Extraction

**Files:**
- Modify: `src/main/gmailViewController.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/createMainWindow.ts`
- Test: `tests/unit/gmailViewController.test.ts`

- [ ] Add pure helper tests for dynamic Gmail bounds and Google account metadata parsing.
- [ ] Add `setTopInset(height)` to `GmailViewController`.
- [ ] Add delayed metadata extraction after Gmail navigation.
- [ ] Add IPC channels for `appChrome:setHeight` and `profiles:changed`.
- [ ] Run: `npm test -- tests/unit/gmailViewController.test.ts`

### Task 3: Renderer Profile Buttons And Settings

**Files:**
- Modify: `src/renderer/App.tsx`
- Create: `src/renderer/components/ProfileSwitcher.tsx`
- Modify: `src/renderer/components/ProfileManager.tsx`
- Modify: `src/renderer/api.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/renderer/styles.css`
- Test: `tests/renderer/App.test.tsx`

- [ ] Replace dropdown tests with circular profile button tests.
- [ ] Add settings button tests and profile manager location tests.
- [ ] Disable add profile at five profiles.
- [ ] Subscribe to profile state changes from main.
- [ ] Run: `npm test -- tests/renderer/App.test.tsx`

### Task 4: Verification

- [ ] Run: `npm test`
- [ ] Run: `npm run typecheck`
- [ ] Run: `npm run test:e2e`
- [ ] Run: `npm run dist:mac`
- [ ] Launch the app manually and verify top chrome, Settings, and profile switching.
