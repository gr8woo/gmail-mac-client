# Gmail Mac Client V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-window Electron Mac app that runs Gmail without browser chrome and supports manually created profiles with isolated Gmail sessions.

**Architecture:** Use Electron main process for native lifecycle, profile persistence, session partitions, URL policy, and `WebContentsView` Gmail hosting. Use a small React renderer for first-run profile creation, top dropdown, and profile management. Keep Gmail as the actual mail UI and store only local profile metadata.

**Tech Stack:** Electron, TypeScript, React, Vite, Vitest, Testing Library, Playwright Electron, electron-builder.

---

## Implementation Notes

- Use `WebContentsView` instead of `BrowserView`; Electron's official docs mark `BrowserView` deprecated and replaced by `WebContentsView`.
- Do not use Electron's `<webview>` tag for Gmail content.
- Use persistent Electron session partitions in the form `persist:gmail-profile-<profileId>`.
- Keep the selected Gmail view alive for V1. Do not keep inactive profile views alive unless a later performance task requires it.
- Use `GMAIL_CLIENT_START_URL` during tests so automated tests can load local fixture pages instead of real Gmail.

## File Structure

- `package.json`: scripts, dependencies, app metadata.
- `tsconfig.json`: shared TypeScript base config.
- `tsconfig.main.json`: Electron main-process TypeScript config.
- `tsconfig.renderer.json`: renderer TypeScript config.
- `vite.config.ts`: renderer Vite config.
- `vitest.config.ts`: unit/component test config.
- `playwright.config.ts`: Electron smoke test config.
- `electron-builder.yml`: macOS build config.
- `index.html`: renderer HTML entry.
- `src/shared/profile.ts`: profile types and helpers.
- `src/shared/urlPolicy.ts`: Gmail allowlist and external-link decision logic.
- `src/main/main.ts`: Electron app entry point.
- `src/main/createMainWindow.ts`: window creation and view layout wiring.
- `src/main/gmailViewController.ts`: `WebContentsView` lifecycle and Gmail loading.
- `src/main/profileStore.ts`: local JSON profile metadata store.
- `src/main/ipc.ts`: typed IPC handlers exposed to renderer.
- `src/preload/preload.ts`: safe renderer bridge.
- `src/renderer/main.tsx`: React entry point.
- `src/renderer/App.tsx`: top-level shell state.
- `src/renderer/components/ProfileDropdown.tsx`: profile switcher.
- `src/renderer/components/FirstRun.tsx`: first profile creation screen.
- `src/renderer/components/ProfileManager.tsx`: add, rename, delete profile UI.
- `src/renderer/components/StatusBar.tsx`: loading/error status.
- `src/renderer/styles.css`: compact shell styling.
- `tests/unit/profileStore.test.ts`: profile persistence tests.
- `tests/unit/urlPolicy.test.ts`: URL routing tests.
- `tests/unit/profile.test.ts`: profile helper tests.
- `tests/renderer/App.test.tsx`: shell UI tests.
- `tests/e2e/electron-smoke.spec.ts`: app smoke tests with local fixture URL.
- `tests/fixtures/gmail.html`: local Gmail-like fixture page.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.main.json`
- Create: `tsconfig.renderer.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `electron-builder.yml`
- Create: `index.html`
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`
- Create: `src/renderer/styles.css`

- [ ] **Step 1: Create package metadata and scripts**

Create `package.json`:

```json
{
  "name": "gmail-mac-client",
  "version": "0.1.0",
  "description": "A dedicated Gmail Mac client with isolated local profiles.",
  "main": "dist/main/main.js",
  "scripts": {
    "dev": "concurrently -k \"vite --host 127.0.0.1\" \"wait-on tcp:5173 && cross-env VITE_DEV_SERVER_URL=http://127.0.0.1:5173 electron .\"",
    "build": "npm run typecheck && vite build && tsc -p tsconfig.main.json && tsc -p tsconfig.renderer.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "npm run build && playwright test",
    "typecheck": "tsc --noEmit -p tsconfig.renderer.json && tsc --noEmit -p tsconfig.main.json",
    "dist:mac": "npm run build && electron-builder --mac dir"
  },
  "build": {
    "extends": null
  },
  "dependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.54.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.2.0",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitest/ui": "^3.0.0",
    "concurrently": "^9.1.0",
    "cross-env": "^7.0.3",
    "electron": "^39.0.0",
    "electron-builder": "^25.1.0",
    "jsdom": "^26.0.0",
    "typescript": "^5.7.0",
    "vite": "^7.0.0",
    "vitest": "^3.0.0",
    "wait-on": "^8.0.0"
  }
}
```

- [ ] **Step 2: Create TypeScript and build configs**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

Create `tsconfig.main.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "types": ["node"]
  },
  "include": ["src/main/**/*.ts", "src/preload/**/*.ts", "src/shared/**/*.ts"]
}
```

Create `tsconfig.renderer.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src/renderer/**/*.ts", "src/renderer/**/*.tsx", "src/shared/**/*.ts", "tests/**/*.ts", "tests/**/*.tsx"]
}
```

- [ ] **Step 3: Create Vite, Vitest, Playwright, and builder configs**

Create `vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173
  },
  build: {
    outDir: "dist/renderer"
  }
});
```

Create `vitest.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["tests/setup.ts"]
  }
});
```

Create `playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: {
    trace: "on-first-retry"
  }
});
```

Create `electron-builder.yml`:

```yaml
appId: com.local.gmailmacclient
productName: Gmail Mac Client
directories:
  output: release
files:
  - dist/**
  - package.json
mac:
  category: public.app-category.productivity
```

- [ ] **Step 4: Create minimal renderer entry**

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Gmail Mac Client</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
```

Create `src/renderer/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `src/renderer/App.tsx`:

```tsx
export function App() {
  return (
    <main className="app-shell">
      <section className="first-run">
        <h1>Gmail Mac Client</h1>
        <p>Create your first local Gmail profile.</p>
      </section>
    </main>
  );
}
```

Create `src/renderer/styles.css`:

```css
:root {
  color: #1f2328;
  background: #f6f8fa;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

.app-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
}

.first-run {
  width: min(420px, calc(100vw - 32px));
}
```

- [ ] **Step 5: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and dependencies install without errors.

- [ ] **Step 6: Verify scaffold builds**

Run:

```bash
npm run typecheck
```

Expected: TypeScript fails because main entry files do not exist yet, or passes if TypeScript accepts the current include set. If it fails only because no main files exist, continue to Task 2.

- [ ] **Step 7: Commit scaffold**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.main.json tsconfig.renderer.json vite.config.ts vitest.config.ts playwright.config.ts electron-builder.yml index.html src/renderer/main.tsx src/renderer/App.tsx src/renderer/styles.css
git commit -m "chore: scaffold electron react app"
```

---

### Task 2: Profile Domain Model

**Files:**
- Create: `src/shared/profile.ts`
- Create: `tests/unit/profile.test.ts`
- Create: `tests/setup.ts`

- [ ] **Step 1: Write failing profile helper tests**

Create `tests/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Create `tests/unit/profile.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createProfile, getPartitionName, normalizeProfileName } from "../../src/shared/profile";

describe("profile helpers", () => {
  it("normalizes profile names", () => {
    expect(normalizeProfileName("  Work Mail  ")).toBe("Work Mail");
  });

  it("rejects empty profile names", () => {
    expect(() => normalizeProfileName("   ")).toThrow("Profile name is required");
  });

  it("creates a profile with a persistent partition", () => {
    const profile = createProfile("Work", "profile_123", "2026-05-08T00:00:00.000Z");

    expect(profile).toEqual({
      id: "profile_123",
      displayName: "Work",
      partition: "persist:gmail-profile-profile_123",
      createdAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z"
    });
  });

  it("derives partition names from profile ids", () => {
    expect(getPartitionName("abc")).toBe("persist:gmail-profile-abc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/profile.test.ts
```

Expected: FAIL with an import error for `src/shared/profile`.

- [ ] **Step 3: Implement profile helpers**

Create `src/shared/profile.ts`:

```ts
export interface GmailProfile {
  id: string;
  displayName: string;
  partition: string;
  createdAt: string;
  updatedAt: string;
}

export function normalizeProfileName(name: string): string {
  const normalized = name.trim();

  if (!normalized) {
    throw new Error("Profile name is required");
  }

  return normalized;
}

export function getPartitionName(profileId: string): string {
  return `persist:gmail-profile-${profileId}`;
}

export function createProfile(displayName: string, id: string, now: string): GmailProfile {
  const normalizedName = normalizeProfileName(displayName);

  return {
    id,
    displayName: normalizedName,
    partition: getPartitionName(id),
    createdAt: now,
    updatedAt: now
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/unit/profile.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit profile model**

```bash
git add src/shared/profile.ts tests/setup.ts tests/unit/profile.test.ts
git commit -m "feat: add profile domain model"
```

---

### Task 3: Profile Store

**Files:**
- Create: `src/main/profileStore.ts`
- Create: `tests/unit/profileStore.test.ts`

- [ ] **Step 1: Write failing store tests**

Create `tests/unit/profileStore.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileProfileStore } from "../../src/main/profileStore";

let tempDir: string | undefined;

function makeStore() {
  tempDir = mkdtempSync(join(tmpdir(), "gmail-client-store-"));
  return new FileProfileStore(join(tempDir, "profiles.json"));
}

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("FileProfileStore", () => {
  it("starts empty", () => {
    const store = makeStore();
    expect(store.getState()).toEqual({ profiles: [], lastActiveProfileId: null });
  });

  it("creates and persists a profile", () => {
    const store = makeStore();
    const profile = store.createProfile("Work", "2026-05-08T00:00:00.000Z");
    const reloaded = new FileProfileStore(store.filePath);

    expect(profile.displayName).toBe("Work");
    expect(reloaded.getState().profiles).toHaveLength(1);
    expect(reloaded.getState().lastActiveProfileId).toBe(profile.id);
  });

  it("renames a profile", () => {
    const store = makeStore();
    const profile = store.createProfile("Work", "2026-05-08T00:00:00.000Z");

    store.renameProfile(profile.id, "Primary Work", "2026-05-08T01:00:00.000Z");

    expect(store.getState().profiles[0]?.displayName).toBe("Primary Work");
    expect(store.getState().profiles[0]?.updatedAt).toBe("2026-05-08T01:00:00.000Z");
  });

  it("deletes a profile and clears last active when needed", () => {
    const store = makeStore();
    const profile = store.createProfile("Work", "2026-05-08T00:00:00.000Z");

    store.deleteProfile(profile.id);

    expect(store.getState()).toEqual({ profiles: [], lastActiveProfileId: null });
  });

  it("sets last active profile", () => {
    const store = makeStore();
    const profile = store.createProfile("Work", "2026-05-08T00:00:00.000Z");

    store.setLastActiveProfile(profile.id);

    expect(store.getState().lastActiveProfileId).toBe(profile.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/profileStore.test.ts
```

Expected: FAIL with an import error for `src/main/profileStore`.

- [ ] **Step 3: Implement file-backed profile store**

Create `src/main/profileStore.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { createProfile, GmailProfile, normalizeProfileName } from "../shared/profile";

export interface ProfileState {
  profiles: GmailProfile[];
  lastActiveProfileId: string | null;
}

const EMPTY_STATE: ProfileState = {
  profiles: [],
  lastActiveProfileId: null
};

export class FileProfileStore {
  constructor(public readonly filePath: string) {}

  getState(): ProfileState {
    if (!existsSync(this.filePath)) {
      return { ...EMPTY_STATE, profiles: [] };
    }

    const raw = readFileSync(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as ProfileState;

    return {
      profiles: parsed.profiles ?? [],
      lastActiveProfileId: parsed.lastActiveProfileId ?? null
    };
  }

  createProfile(displayName: string, now = new Date().toISOString()): GmailProfile {
    const state = this.getState();
    const profile = createProfile(displayName, randomUUID(), now);

    this.saveState({
      profiles: [...state.profiles, profile],
      lastActiveProfileId: profile.id
    });

    return profile;
  }

  renameProfile(profileId: string, displayName: string, now = new Date().toISOString()): GmailProfile {
    const state = this.getState();
    const normalizedName = normalizeProfileName(displayName);
    let renamedProfile: GmailProfile | undefined;

    const profiles = state.profiles.map((profile) => {
      if (profile.id !== profileId) {
        return profile;
      }

      renamedProfile = {
        ...profile,
        displayName: normalizedName,
        updatedAt: now
      };

      return renamedProfile;
    });

    if (!renamedProfile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    this.saveState({ ...state, profiles });
    return renamedProfile;
  }

  deleteProfile(profileId: string): void {
    const state = this.getState();
    const profiles = state.profiles.filter((profile) => profile.id !== profileId);
    const lastActiveProfileId = state.lastActiveProfileId === profileId ? profiles[0]?.id ?? null : state.lastActiveProfileId;

    this.saveState({ profiles, lastActiveProfileId });
  }

  setLastActiveProfile(profileId: string): void {
    const state = this.getState();

    if (!state.profiles.some((profile) => profile.id === profileId)) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    this.saveState({ ...state, lastActiveProfileId: profileId });
  }

  private saveState(state: ProfileState): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/unit/profileStore.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit profile store**

```bash
git add src/main/profileStore.ts tests/unit/profileStore.test.ts
git commit -m "feat: persist local gmail profiles"
```

---

### Task 4: URL Policy

**Files:**
- Create: `src/shared/urlPolicy.ts`
- Create: `tests/unit/urlPolicy.test.ts`

- [ ] **Step 1: Write failing URL policy tests**

Create `tests/unit/urlPolicy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyNavigationUrl } from "../../src/shared/urlPolicy";

describe("classifyNavigationUrl", () => {
  it("keeps Gmail URLs in the app", () => {
    expect(classifyNavigationUrl("https://mail.google.com/mail/u/0/#inbox")).toBe("internal");
  });

  it("keeps Google auth URLs in the app", () => {
    expect(classifyNavigationUrl("https://accounts.google.com/signin/v2/identifier")).toBe("internal");
  });

  it("keeps Google OAuth URLs in the app", () => {
    expect(classifyNavigationUrl("https://oauthaccountmanager.googleapis.com/v1/issuetoken")).toBe("internal");
  });

  it("opens non-Gmail URLs externally", () => {
    expect(classifyNavigationUrl("https://example.com/article")).toBe("external");
  });

  it("opens invalid URLs externally", () => {
    expect(classifyNavigationUrl("not a url")).toBe("external");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/urlPolicy.test.ts
```

Expected: FAIL with an import error for `src/shared/urlPolicy`.

- [ ] **Step 3: Implement URL policy**

Create `src/shared/urlPolicy.ts`:

```ts
export type NavigationDecision = "internal" | "external";

const INTERNAL_HOSTS = new Set([
  "mail.google.com",
  "accounts.google.com",
  "myaccount.google.com",
  "oauthaccountmanager.googleapis.com",
  "ssl.gstatic.com",
  "www.gstatic.com"
]);

export function classifyNavigationUrl(rawUrl: string): NavigationDecision {
  try {
    const url = new URL(rawUrl);

    if (url.protocol !== "https:") {
      return "external";
    }

    return INTERNAL_HOSTS.has(url.hostname) ? "internal" : "external";
  } catch {
    return "external";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/unit/urlPolicy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit URL policy**

```bash
git add src/shared/urlPolicy.ts tests/unit/urlPolicy.test.ts
git commit -m "feat: add gmail navigation policy"
```

---

### Task 5: Electron Main Window And Preload Bridge

**Files:**
- Create: `src/main/main.ts`
- Create: `src/main/createMainWindow.ts`
- Create: `src/preload/preload.ts`
- Modify: `package.json`

- [ ] **Step 1: Add preload API types**

Create `src/preload/preload.ts`:

```ts
import { contextBridge, ipcRenderer } from "electron";
import type { GmailProfile, ProfileState } from "../shared/profile";

export interface GmailClientApi {
  getProfileState(): Promise<ProfileState>;
  createProfile(displayName: string): Promise<GmailProfile>;
  renameProfile(profileId: string, displayName: string): Promise<GmailProfile>;
  deleteProfile(profileId: string): Promise<void>;
  switchProfile(profileId: string): Promise<void>;
}

const api: GmailClientApi = {
  getProfileState: () => ipcRenderer.invoke("profiles:getState"),
  createProfile: (displayName) => ipcRenderer.invoke("profiles:create", displayName),
  renameProfile: (profileId, displayName) => ipcRenderer.invoke("profiles:rename", profileId, displayName),
  deleteProfile: (profileId) => ipcRenderer.invoke("profiles:delete", profileId),
  switchProfile: (profileId) => ipcRenderer.invoke("profiles:switch", profileId)
};

contextBridge.exposeInMainWorld("gmailClient", api);
```

- [ ] **Step 2: Add renderer global type**

Modify `src/shared/profile.ts` by appending:

```ts
export interface ProfileState {
  profiles: GmailProfile[];
  lastActiveProfileId: string | null;
}
```

Then update `src/main/profileStore.ts` to import `ProfileState` from `../shared/profile` and remove its local `ProfileState` interface.

- [ ] **Step 3: Create main window factory**

Create `src/main/createMainWindow.ts`:

```ts
import { BrowserWindow } from "electron";
import { join } from "node:path";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

export async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    title: "Gmail Mac Client",
    webPreferences: {
      preload: join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL!);
  } else {
    await window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}
```

- [ ] **Step 4: Create Electron app entry**

Create `src/main/main.ts`:

```ts
import { app } from "electron";
import { createMainWindow } from "./createMainWindow";

app.setName("Gmail Mac Client");

app.whenReady().then(async () => {
  await createMainWindow();

  app.on("activate", async () => {
    if (process.platform === "darwin" && !globalThis.mainWindowOpen) {
      await createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
```

- [ ] **Step 5: Fix main window tracking**

Replace `src/main/main.ts` with:

```ts
import { app, BrowserWindow } from "electron";
import { createMainWindow } from "./createMainWindow";

app.setName("Gmail Mac Client");

async function ensureWindow(): Promise<BrowserWindow> {
  const existing = BrowserWindow.getAllWindows()[0];

  if (existing) {
    existing.show();
    return existing;
  }

  return createMainWindow();
}

app.whenReady().then(async () => {
  await ensureWindow();

  app.on("activate", async () => {
    await ensureWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
```

- [ ] **Step 6: Build to verify Electron entry**

Run:

```bash
npm run build
```

Expected: PASS and `dist/main/main.js`, `dist/preload/preload.js`, and `dist/renderer` exist.

- [ ] **Step 7: Commit main shell**

```bash
git add package.json src/main/main.ts src/main/createMainWindow.ts src/preload/preload.ts src/shared/profile.ts src/main/profileStore.ts
git commit -m "feat: add electron main window shell"
```

---

### Task 6: IPC Profile API

**Files:**
- Create: `src/main/ipc.ts`
- Modify: `src/main/createMainWindow.ts`
- Modify: `src/preload/preload.ts`

- [ ] **Step 1: Implement IPC handlers**

Create `src/main/ipc.ts`:

```ts
import { app, ipcMain, session } from "electron";
import { join } from "node:path";
import { FileProfileStore } from "./profileStore";

export interface ProfileSwitchTarget {
  switchToProfile(profileId: string): Promise<void>;
}

export function createDefaultProfileStore(): FileProfileStore {
  return new FileProfileStore(join(app.getPath("userData"), "profiles.json"));
}

export function registerProfileIpc(store: FileProfileStore, target: ProfileSwitchTarget): void {
  ipcMain.handle("profiles:getState", () => store.getState());

  ipcMain.handle("profiles:create", async (_event, displayName: string) => {
    const profile = store.createProfile(displayName);
    await target.switchToProfile(profile.id);
    return profile;
  });

  ipcMain.handle("profiles:rename", (_event, profileId: string, displayName: string) => {
    return store.renameProfile(profileId, displayName);
  });

  ipcMain.handle("profiles:delete", async (_event, profileId: string) => {
    const profile = store.getState().profiles.find((candidate) => candidate.id === profileId);

    store.deleteProfile(profileId);

    if (profile) {
      await session.fromPartition(profile.partition).clearStorageData();
    }

    const nextProfileId = store.getState().lastActiveProfileId;
    if (nextProfileId) {
      await target.switchToProfile(nextProfileId);
    }
  });

  ipcMain.handle("profiles:switch", async (_event, profileId: string) => {
    store.setLastActiveProfile(profileId);
    await target.switchToProfile(profileId);
  });
}
```

- [ ] **Step 2: Wire IPC into window creation**

Modify `src/main/createMainWindow.ts` to accept a callback after later Gmail controller creation:

```ts
import { BrowserWindow } from "electron";
import { join } from "node:path";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

export async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    title: "Gmail Mac Client",
    webPreferences: {
      preload: join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL!);
  } else {
    await window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}
```

- [ ] **Step 3: Build to verify IPC types**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit IPC API**

```bash
git add src/main/ipc.ts src/main/createMainWindow.ts src/preload/preload.ts
git commit -m "feat: expose profile ipc api"
```

---

### Task 7: Gmail WebContentsView Controller

**Files:**
- Create: `src/main/gmailViewController.ts`
- Modify: `src/main/createMainWindow.ts`
- Modify: `src/main/main.ts`

- [ ] **Step 1: Create Gmail view controller**

Create `src/main/gmailViewController.ts`:

```ts
import { BrowserWindow, Rectangle, WebContentsView, shell } from "electron";
import type { FileProfileStore } from "./profileStore";
import { classifyNavigationUrl } from "../shared/urlPolicy";

const APP_BAR_HEIGHT = 44;
const DEFAULT_GMAIL_URL = "https://mail.google.com";

export class GmailViewController {
  private currentView: WebContentsView | null = null;

  constructor(
    private readonly window: BrowserWindow,
    private readonly store: FileProfileStore,
    private readonly startUrl = process.env.GMAIL_CLIENT_START_URL ?? DEFAULT_GMAIL_URL
  ) {}

  attach(): void {
    this.window.on("resize", () => this.layout());
  }

  async switchToProfile(profileId: string): Promise<void> {
    const profile = this.store.getState().profiles.find((candidate) => candidate.id === profileId);

    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    if (this.currentView) {
      this.window.contentView.removeChildView(this.currentView);
      this.currentView.webContents.close();
      this.currentView = null;
    }

    const view = new WebContentsView({
      webPreferences: {
        partition: profile.partition,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });

    view.webContents.setWindowOpenHandler(({ url }) => {
      if (classifyNavigationUrl(url) === "external") {
        void shell.openExternal(url);
        return { action: "deny" };
      }

      return { action: "allow" };
    });

    view.webContents.on("will-navigate", (event, url) => {
      if (classifyNavigationUrl(url) === "external") {
        event.preventDefault();
        void shell.openExternal(url);
      }
    });

    this.currentView = view;
    this.window.contentView.addChildView(view);
    this.layout();
    await view.webContents.loadURL(this.startUrl);
  }

  layout(): void {
    if (!this.currentView) {
      return;
    }

    const bounds = this.window.getContentBounds();
    this.currentView.setBounds(getGmailBounds(bounds));
  }
}

export function getGmailBounds(bounds: Rectangle): Rectangle {
  return {
    x: 0,
    y: APP_BAR_HEIGHT,
    width: bounds.width,
    height: Math.max(0, bounds.height - APP_BAR_HEIGHT)
  };
}
```

- [ ] **Step 2: Wire controller and profile IPC**

Replace `src/main/createMainWindow.ts` with:

```ts
import { BrowserWindow } from "electron";
import { join } from "node:path";
import { createDefaultProfileStore, registerProfileIpc } from "./ipc";
import { GmailViewController } from "./gmailViewController";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

export async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    title: "Gmail Mac Client",
    webPreferences: {
      preload: join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const store = createDefaultProfileStore();
  const gmailViewController = new GmailViewController(window, store);
  gmailViewController.attach();
  registerProfileIpc(store, gmailViewController);

  if (isDev) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL!);
  } else {
    await window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  const lastActiveProfileId = store.getState().lastActiveProfileId;
  if (lastActiveProfileId) {
    await gmailViewController.switchToProfile(lastActiveProfileId);
  }

  return window;
}
```

- [ ] **Step 3: Build to verify WebContentsView usage**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit Gmail controller**

```bash
git add src/main/gmailViewController.ts src/main/createMainWindow.ts src/main/main.ts
git commit -m "feat: host gmail in isolated webcontents views"
```

---

### Task 8: Renderer Shell UI

**Files:**
- Create: `src/renderer/api.ts`
- Create: `src/renderer/components/FirstRun.tsx`
- Create: `src/renderer/components/ProfileDropdown.tsx`
- Create: `src/renderer/components/ProfileManager.tsx`
- Create: `src/renderer/components/StatusBar.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`
- Create: `tests/renderer/App.test.tsx`

- [ ] **Step 1: Add renderer API wrapper**

Create `src/renderer/api.ts`:

```ts
import type { GmailProfile, ProfileState } from "../shared/profile";

declare global {
  interface Window {
    gmailClient: {
      getProfileState(): Promise<ProfileState>;
      createProfile(displayName: string): Promise<GmailProfile>;
      renameProfile(profileId: string, displayName: string): Promise<GmailProfile>;
      deleteProfile(profileId: string): Promise<void>;
      switchProfile(profileId: string): Promise<void>;
    };
  }
}

export const gmailClient = window.gmailClient;
```

- [ ] **Step 2: Write failing App tests**

Create `tests/renderer/App.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/renderer/App";
import type { ProfileState } from "../../src/shared/profile";

function installApi(state: ProfileState) {
  const api = {
    getProfileState: vi.fn().mockResolvedValue(state),
    createProfile: vi.fn().mockResolvedValue({
      id: "profile_1",
      displayName: "Work",
      partition: "persist:gmail-profile-profile_1",
      createdAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z"
    }),
    renameProfile: vi.fn(),
    deleteProfile: vi.fn(),
    switchProfile: vi.fn()
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
  });

  it("shows first-run profile creation when no profiles exist", async () => {
    installApi({ profiles: [], lastActiveProfileId: null });

    render(<App />);

    expect(await screen.findByText("Create your first Gmail profile")).toBeInTheDocument();
  });

  it("creates the first profile", async () => {
    const api = installApi({ profiles: [], lastActiveProfileId: null });
    const user = userEvent.setup();

    render(<App />);

    await user.type(await screen.findByLabelText("Profile name"), "Work");
    await user.click(screen.getByRole("button", { name: "Create profile" }));

    await waitFor(() => expect(api.createProfile).toHaveBeenCalledWith("Work"));
  });

  it("shows profile dropdown when profiles exist", async () => {
    installApi({
      lastActiveProfileId: "profile_1",
      profiles: [
        {
          id: "profile_1",
          displayName: "Work",
          partition: "persist:gmail-profile-profile_1",
          createdAt: "2026-05-08T00:00:00.000Z",
          updatedAt: "2026-05-08T00:00:00.000Z"
        }
      ]
    });

    render(<App />);

    expect(await screen.findByRole("combobox", { name: "Current profile" })).toHaveValue("profile_1");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
npm test -- tests/renderer/App.test.tsx
```

Expected: FAIL because components and app behavior are not implemented.

- [ ] **Step 4: Implement first-run and dropdown components**

Create `src/renderer/components/FirstRun.tsx`:

```tsx
import { FormEvent, useState } from "react";

interface FirstRunProps {
  onCreateProfile(displayName: string): Promise<void>;
}

export function FirstRun({ onCreateProfile }: FirstRunProps) {
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await onCreateProfile(displayName);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create profile");
    }
  }

  return (
    <section className="first-run" aria-labelledby="first-run-title">
      <h1 id="first-run-title">Create your first Gmail profile</h1>
      <form onSubmit={submit}>
        <label>
          Profile name
          <input value={displayName} onChange={(event) => setDisplayName(event.currentTarget.value)} />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit">Create profile</button>
      </form>
    </section>
  );
}
```

Create `src/renderer/components/ProfileDropdown.tsx`:

```tsx
import type { GmailProfile } from "../../shared/profile";

interface ProfileDropdownProps {
  profiles: GmailProfile[];
  activeProfileId: string | null;
  onSwitchProfile(profileId: string): Promise<void>;
  onOpenManager(): void;
}

export function ProfileDropdown({ profiles, activeProfileId, onSwitchProfile, onOpenManager }: ProfileDropdownProps) {
  return (
    <header className="app-bar">
      <select
        aria-label="Current profile"
        value={activeProfileId ?? ""}
        onChange={(event) => void onSwitchProfile(event.currentTarget.value)}
      >
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.displayName}
          </option>
        ))}
      </select>
      <button type="button" onClick={onOpenManager}>
        Manage
      </button>
    </header>
  );
}
```

Create `src/renderer/components/ProfileManager.tsx`:

```tsx
import { FormEvent, useState } from "react";
import type { GmailProfile } from "../../shared/profile";

interface ProfileManagerProps {
  profiles: GmailProfile[];
  onCreateProfile(displayName: string): Promise<void>;
  onRenameProfile(profileId: string, displayName: string): Promise<void>;
  onDeleteProfile(profileId: string): Promise<void>;
  onClose(): void;
}

export function ProfileManager({ profiles, onCreateProfile, onRenameProfile, onDeleteProfile, onClose }: ProfileManagerProps) {
  const [newName, setNewName] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreateProfile(newName);
    setNewName("");
  }

  return (
    <section className="profile-manager" aria-label="Profile management">
      <button type="button" onClick={onClose}>Close</button>
      <form onSubmit={submit}>
        <label>
          New profile name
          <input value={newName} onChange={(event) => setNewName(event.currentTarget.value)} />
        </label>
        <button type="submit">Add profile</button>
      </form>
      <ul>
        {profiles.map((profile) => (
          <li key={profile.id}>
            <input
              aria-label={`Rename ${profile.displayName}`}
              defaultValue={profile.displayName}
              onBlur={(event) => void onRenameProfile(profile.id, event.currentTarget.value)}
            />
            <button type="button" onClick={() => void onDeleteProfile(profile.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

Create `src/renderer/components/StatusBar.tsx`:

```tsx
interface StatusBarProps {
  message: string | null;
}

export function StatusBar({ message }: StatusBarProps) {
  if (!message) {
    return null;
  }

  return <p className="status-bar">{message}</p>;
}
```

- [ ] **Step 5: Implement app state**

Replace `src/renderer/App.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { gmailClient } from "./api";
import { FirstRun } from "./components/FirstRun";
import { ProfileDropdown } from "./components/ProfileDropdown";
import { ProfileManager } from "./components/ProfileManager";
import { StatusBar } from "./components/StatusBar";
import type { ProfileState } from "../shared/profile";

export function App() {
  const [state, setState] = useState<ProfileState | null>(null);
  const [isManagingProfiles, setIsManagingProfiles] = useState(false);
  const [status, setStatus] = useState<string | null>("Loading profiles...");

  async function refreshState() {
    const nextState = await gmailClient.getProfileState();
    setState(nextState);
    setStatus(null);
  }

  useEffect(() => {
    void refreshState().catch((error) => {
      setStatus(error instanceof Error ? error.message : "Unable to load profiles");
    });
  }, []);

  async function createProfile(displayName: string) {
    await gmailClient.createProfile(displayName);
    await refreshState();
  }

  async function switchProfile(profileId: string) {
    await gmailClient.switchProfile(profileId);
    await refreshState();
  }

  async function renameProfile(profileId: string, displayName: string) {
    await gmailClient.renameProfile(profileId, displayName);
    await refreshState();
  }

  async function deleteProfile(profileId: string) {
    const confirmed = window.confirm("Delete this profile and its local Gmail session data?");

    if (!confirmed) {
      return;
    }

    await gmailClient.deleteProfile(profileId);
    await refreshState();
  }

  if (!state) {
    return <StatusBar message={status} />;
  }

  if (state.profiles.length === 0) {
    return (
      <main className="app-shell first-run-shell">
        <FirstRun onCreateProfile={createProfile} />
        <StatusBar message={status} />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <ProfileDropdown
        profiles={state.profiles}
        activeProfileId={state.lastActiveProfileId}
        onSwitchProfile={switchProfile}
        onOpenManager={() => setIsManagingProfiles(true)}
      />
      {isManagingProfiles ? (
        <ProfileManager
          profiles={state.profiles}
          onCreateProfile={createProfile}
          onRenameProfile={renameProfile}
          onDeleteProfile={deleteProfile}
          onClose={() => setIsManagingProfiles(false)}
        />
      ) : null}
      <StatusBar message={status} />
    </main>
  );
}
```

- [ ] **Step 6: Replace styling**

Replace `src/renderer/styles.css` with:

```css
:root {
  color: #1f2328;
  background: transparent;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  overflow: hidden;
}

button,
input,
select {
  font: inherit;
}

.app-shell {
  min-height: 44px;
}

.first-run-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #f6f8fa;
}

.first-run {
  width: min(420px, calc(100vw - 32px));
}

.first-run form,
.profile-manager form {
  display: grid;
  gap: 12px;
}

.first-run label,
.profile-manager label {
  display: grid;
  gap: 6px;
}

.first-run input,
.profile-manager input,
.app-bar select {
  height: 32px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  padding: 0 10px;
}

.first-run button,
.profile-manager button,
.app-bar button {
  height: 32px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  background: #ffffff;
}

.app-bar {
  height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid #d0d7de;
  background: #ffffff;
}

.profile-manager {
  position: absolute;
  top: 52px;
  right: 12px;
  z-index: 10;
  width: 360px;
  padding: 14px;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 12px 28px rgba(31, 35, 40, 0.18);
}

.profile-manager ul {
  display: grid;
  gap: 8px;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
}

.profile-manager li {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}

.status-bar {
  margin: 8px 10px;
}
```

- [ ] **Step 7: Run tests and build**

Run:

```bash
npm test -- tests/renderer/App.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit renderer shell**

```bash
git add src/renderer tests/renderer
git commit -m "feat: add profile shell ui"
```

---

### Task 9: Electron Smoke Tests

**Files:**
- Create: `tests/fixtures/gmail.html`
- Create: `tests/e2e/electron-smoke.spec.ts`

- [ ] **Step 1: Create Gmail fixture**

Create `tests/fixtures/gmail.html`:

```html
<!doctype html>
<html>
  <head>
    <title>Gmail Fixture</title>
  </head>
  <body>
    <h1>Gmail Fixture</h1>
    <a href="https://example.com/external" target="_blank">External link</a>
  </body>
</html>
```

- [ ] **Step 2: Create smoke test**

Create `tests/e2e/electron-smoke.spec.ts`:

```ts
import { _electron as electron, expect, test } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

test("creates a profile and shows the top profile dropdown", async () => {
  const fixtureUrl = pathToFileURL(join(process.cwd(), "tests/fixtures/gmail.html")).toString();
  const app = await electron.launch({
    args: ["."],
    env: {
      ...process.env,
      GMAIL_CLIENT_START_URL: fixtureUrl
    }
  });

  const window = await app.firstWindow();
  await expect(window.getByText("Create your first Gmail profile")).toBeVisible();

  await window.getByLabel("Profile name").fill("Work");
  await window.getByRole("button", { name: "Create profile" }).click();

  await expect(window.getByRole("combobox", { name: "Current profile" })).toHaveValue(/.+/);

  await app.close();
});
```

- [ ] **Step 3: Run smoke test**

Run:

```bash
npm run test:e2e
```

Expected: PASS. If macOS prompts for permissions, approve the local app test and rerun.

- [ ] **Step 4: Commit smoke test**

```bash
git add tests/fixtures/gmail.html tests/e2e/electron-smoke.spec.ts
git commit -m "test: add electron profile smoke test"
```

---

### Task 10: Manual Gmail Verification And Mac Build

**Files:**
- Modify: `docs/superpowers/specs/2026-05-08-gmail-mac-client-design.md` only if implementation findings require clarifying the spec.

- [ ] **Step 1: Start the app against real Gmail**

Run:

```bash
npm run dev
```

Expected: Electron app opens with first-run profile creation.

- [ ] **Step 2: Verify first profile login**

Manual steps:

```text
1. Create profile named Work.
2. Confirm Gmail login page opens.
3. Sign into a Google account.
4. Quit the app.
5. Run npm run dev again.
6. Confirm the Work profile is selected and still signed in.
```

Expected: Login session persists for the Work profile.

- [ ] **Step 3: Verify second profile isolation**

Manual steps:

```text
1. Open profile manager.
2. Add profile named Personal.
3. Sign into a different Google account.
4. Switch back to Work.
5. Switch again to Personal.
```

Expected: Work and Personal show different Gmail accounts and do not overwrite each other's login session.

- [ ] **Step 4: Verify external links**

Manual steps:

```text
1. Open an email that contains a non-Gmail link.
2. Click the link.
```

Expected: Link opens in the default browser, not inside the Gmail Mac Client window.

- [ ] **Step 5: Build macOS app directory**

Run:

```bash
npm run dist:mac
```

Expected: `release/mac/Gmail Mac Client.app` exists and launches.

- [ ] **Step 6: Run final automated checks**

Run:

```bash
npm test
npm run typecheck
npm run test:e2e
```

Expected: PASS.

- [ ] **Step 7: Commit final build readiness**

```bash
git status --short
git add .
git commit -m "chore: verify gmail mac client v1"
```

Only commit if there are source, test, or documentation changes from verification. Do not commit generated `release/` artifacts unless the repository policy explicitly asks for local build outputs.

---

## Self-Review

Spec coverage:

- Standalone Electron Mac app: Task 1, Task 5, Task 10.
- Top profile dropdown: Task 8.
- Manual profile creation, rename, delete: Task 3, Task 6, Task 8.
- Profile-isolated Gmail sessions: Task 2, Task 7, Task 10.
- Last active profile restore: Task 3, Task 7, Task 10.
- Gmail internal navigation and external browser routing: Task 4, Task 7, Task 10.
- No Gmail API, no credential storage: Task 3 and Task 7 preserve this boundary.
- Testing and macOS build: Task 9 and Task 10.

Placeholder scan:

- No unfinished markers or unspecified implementation steps remain.
- Every code-writing step includes concrete file content or a concrete replacement.

Type consistency:

- Shared profile types are defined in `src/shared/profile.ts`.
- Renderer bridge uses `ProfileState` and `GmailProfile` consistently.
- Main process store and IPC use the same profile ids and partition names.
