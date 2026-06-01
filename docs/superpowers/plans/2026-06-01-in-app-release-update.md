# In-App Release Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users check for a newer GitHub Release from inside the app, download the arm64 DMG, and open it immediately.

**Architecture:** Add a focused main-process update service that reads GitHub Releases, compares semantic versions, downloads the selected DMG into the user's Downloads folder, and opens it via Electron shell. Expose two IPC calls through preload and surface update status in the existing app bar/StatusBar UI.

**Tech Stack:** Electron main IPC, Node fetch/file streams, React renderer, Vitest, Testing Library.

---

### Task 1: Update Service

**Files:**
- Create: `src/main/updateService.ts`
- Test: `tests/unit/updateService.test.ts`

- [ ] Write tests for version comparison, latest release parsing, no-update results, and downloadable DMG selection.
- [ ] Implement `checkForUpdate()` with injectable fetch/currentVersion/repository settings.
- [ ] Implement `downloadAndOpenUpdate()` with injectable fetch, download path, file writer, and opener.
- [ ] Run `npm test -- tests/unit/updateService.test.ts`.

### Task 2: IPC And Preload

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/renderer/api.ts`

- [ ] Add `appUpdate:check` and `appUpdate:downloadAndOpen` to trusted IPC channels.
- [ ] Wire the update service into IPC handlers.
- [ ] Expose `checkForUpdate()` and `downloadAndOpenUpdate()` through preload and renderer API types.
- [ ] Run `npm run typecheck`.

### Task 3: App UI

**Files:**
- Modify: `src/renderer/App.tsx`
- Test: `tests/renderer/App.test.tsx`

- [ ] Add failing UI tests for showing an update button when an update is available and triggering download/open.
- [ ] Add state for update availability, checking, downloading, and errors.
- [ ] Check for updates on app startup and display a small app-bar icon button only when a newer release exists.
- [ ] Run `npm test -- tests/renderer/App.test.tsx`.

### Task 4: Verification

**Files:**
- No new source files.

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
