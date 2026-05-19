# Calendar Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in Google Calendar surface per Gmail profile, with account/app top-bar icons and independently cached Mail/Calendar web views.

**Architecture:** Keep profiles as account/session objects and add `GoogleAppKind` surfaces on top of them. Reuse each profile's Electron session partition for both Gmail and Calendar, cache `WebContentsView` instances by `profileId + appKind`, and expose surface switching through IPC. The renderer owns the top-bar account/app icons and Settings Calendar toggle.

**Tech Stack:** Electron `WebContentsView`, React 19, TypeScript, Vitest, Testing Library, existing IPC/preload bridge.

---

## File Structure

- `src/shared/profile.ts`: add surface types (`GoogleAppKind`, `ActiveGoogleSurface`), `calendarEnabled`, and profile helper defaults.
- `src/shared/urlPolicy.ts`: expand internal URL classification to include Google Calendar.
- `src/main/profileStore.ts`: migrate stored profiles, persist `calendarEnabled`, persist active surface, and expose Calendar toggle methods.
- `src/main/gmailViewController.ts`: generalize existing Gmail view controller behavior to surface-aware Mail/Calendar view caching. Keep the filename for this plan to avoid a large rename; optionally rename after the feature is stable.
- `src/main/ipc.ts`: add profile Calendar toggle and surface switching IPC channels.
- `src/preload/preload.ts` and `src/renderer/api.ts`: expose Calendar toggle and surface switching to React.
- `src/renderer/App.tsx`: own active surface state, wire switch/refresh/right inset behavior, and handle Calendar disable fallback.
- `src/renderer/components/ProfileSwitcher.tsx`: render Mail and Calendar buttons per profile with app badges.
- `src/renderer/components/SettingsPage.tsx`: add the per-profile Calendar toggle.
- `src/renderer/styles.css`: style app badges and top-bar overflow.
- Tests under `tests/unit`, `tests/renderer`, and `tests/e2e`: cover persistence, URL policy, controller switching, top-bar rendering, Settings toggle, and smoke behavior.

---

### Task 1: Shared Surface Types And Profile Defaults

**Files:**
- Modify: `src/shared/profile.ts`
- Test: `tests/unit/profile.test.ts`

- [ ] **Step 1: Write failing profile model tests**

Add tests that assert new profiles default Calendar off and that surface helpers produce stable labels.

```ts
// tests/unit/profile.test.ts
import {
  createProfile,
  getGoogleAppLabel,
  getPartitionName,
  getSurfaceKey,
  normalizeProfileName
} from "../../src/shared/profile";

describe("profile helpers", () => {
  it("creates profiles with calendar disabled by default", () => {
    expect(createProfile("Work", "profile-1", "2026-05-19T00:00:00.000Z")).toEqual({
      id: "profile-1",
      displayName: "Work",
      partition: "persist:gmail-profile-profile-1",
      calendarEnabled: false,
      createdAt: "2026-05-19T00:00:00.000Z",
      updatedAt: "2026-05-19T00:00:00.000Z"
    });
  });

  it("builds stable surface keys", () => {
    expect(getSurfaceKey({ profileId: "work", appKind: "mail" })).toBe("work:mail");
    expect(getSurfaceKey({ profileId: "work", appKind: "calendar" })).toBe("work:calendar");
  });

  it("labels Google app kinds", () => {
    expect(getGoogleAppLabel("mail")).toBe("Gmail");
    expect(getGoogleAppLabel("calendar")).toBe("Calendar");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/unit/profile.test.ts
```

Expected: FAIL because `calendarEnabled`, `getSurfaceKey`, and `getGoogleAppLabel` do not exist.

- [ ] **Step 3: Implement shared types and helpers**

Update `src/shared/profile.ts`:

```ts
export const MAX_PROFILES = 5;

export type GoogleAppKind = "mail" | "calendar";

export interface ActiveGoogleSurface {
  profileId: string;
  appKind: GoogleAppKind;
}

export interface GmailProfile {
  id: string;
  displayName: string;
  partition: string;
  email?: string;
  avatarUrl?: string;
  calendarEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileState {
  profiles: GmailProfile[];
  lastActiveProfileId: string | null;
  lastActiveSurface: ActiveGoogleSurface | null;
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
    calendarEnabled: false,
    createdAt: now,
    updatedAt: now
  };
}

export function getSurfaceKey(surface: ActiveGoogleSurface): `${string}:${GoogleAppKind}` {
  return `${surface.profileId}:${surface.appKind}`;
}

export function getGoogleAppLabel(appKind: GoogleAppKind): string {
  return appKind === "calendar" ? "Calendar" : "Gmail";
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
npm test -- tests/unit/profile.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/profile.ts tests/unit/profile.test.ts
git commit -m "feat: add google app surface profile types"
```

---

### Task 2: Profile Store Calendar Persistence And Active Surface

**Files:**
- Modify: `src/main/profileStore.ts`
- Test: `tests/unit/profileStore.test.ts`

- [ ] **Step 1: Write failing persistence tests**

Add tests for migration, toggling, active surface persistence, and fallback validation.

```ts
// tests/unit/profileStore.test.ts
it("migrates stored profiles with calendar disabled by default", () => {
  writeFileSync(
    filePath,
    JSON.stringify({
      profiles: [
        {
          id: "work",
          displayName: "Work",
          partition: "persist:gmail-profile-work",
          createdAt: "2026-05-19T00:00:00.000Z",
          updatedAt: "2026-05-19T00:00:00.000Z"
        }
      ],
      lastActiveProfileId: "work"
    }),
    "utf8"
  );

  expect(store.getState()).toEqual({
    profiles: [
      {
        id: "work",
        displayName: "Work",
        partition: "persist:gmail-profile-work",
        calendarEnabled: false,
        createdAt: "2026-05-19T00:00:00.000Z",
        updatedAt: "2026-05-19T00:00:00.000Z"
      }
    ],
    lastActiveProfileId: "work",
    lastActiveSurface: { profileId: "work", appKind: "mail" }
  });
});

it("enables and disables calendar for a profile", () => {
  const profile = store.createProfile("Work", "2026-05-19T00:00:00.000Z");

  expect(store.setProfileCalendarEnabled(profile.id, true, "2026-05-19T01:00:00.000Z").calendarEnabled).toBe(true);
  expect(store.setProfileCalendarEnabled(profile.id, false, "2026-05-19T02:00:00.000Z").calendarEnabled).toBe(false);
});

it("falls back to mail when disabling the active calendar surface", () => {
  const profile = store.createProfile("Work", "2026-05-19T00:00:00.000Z");
  store.setProfileCalendarEnabled(profile.id, true);
  store.setLastActiveSurface({ profileId: profile.id, appKind: "calendar" });

  store.setProfileCalendarEnabled(profile.id, false);

  expect(store.getState().lastActiveSurface).toEqual({ profileId: profile.id, appKind: "mail" });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/unit/profileStore.test.ts
```

Expected: FAIL because `calendarEnabled`, `lastActiveSurface`, and store methods do not exist.

- [ ] **Step 3: Implement store methods and migration**

Update `EMPTY_STATE`, `createProfile`, `deleteProfile`, `setLastActiveProfile`, `parseProfileState`, and `validateProfile`. Add these methods:

```ts
setProfileCalendarEnabled(profileId: string, enabled: boolean, now = new Date().toISOString()): GmailProfile {
  const state = this.getState();
  let updatedProfile: GmailProfile | undefined;

  const profiles = state.profiles.map((profile) => {
    if (profile.id !== profileId) {
      return profile;
    }

    updatedProfile = {
      ...profile,
      calendarEnabled: enabled,
      updatedAt: now
    };

    return updatedProfile;
  });

  if (!updatedProfile) {
    throw new Error(`Profile not found: ${profileId}`);
  }

  const lastActiveSurface =
    !enabled &&
    state.lastActiveSurface?.profileId === profileId &&
    state.lastActiveSurface.appKind === "calendar"
      ? { profileId, appKind: "mail" as const }
      : state.lastActiveSurface;

  this.saveState({ ...state, profiles, lastActiveSurface });
  return updatedProfile;
}

setLastActiveSurface(surface: ActiveGoogleSurface): void {
  const state = this.getState();
  const profile = state.profiles.find((candidate) => candidate.id === surface.profileId);

  if (!profile) {
    throw new Error(`Profile not found: ${surface.profileId}`);
  }

  if (surface.appKind === "calendar" && !profile.calendarEnabled) {
    throw new Error(`Calendar is not enabled for profile: ${surface.profileId}`);
  }

  this.saveState({
    ...state,
    lastActiveProfileId: surface.profileId,
    lastActiveSurface: surface
  });
}
```

In `validateProfile`, set `calendarEnabled` like this:

```ts
const calendarEnabled = profile.calendarEnabled === true;
```

In `parseProfileState`, return a fallback surface when missing:

```ts
const lastActiveSurface = parseLastActiveSurface(parsed.lastActiveSurface, profiles, lastActiveProfileId);
```

Add `parseLastActiveSurface` that returns:

- the valid stored surface;
- `{ profileId: lastActiveProfileId, appKind: "mail" }` when only `lastActiveProfileId` exists;
- `null` when no active profile exists;
- Mail fallback when Calendar is stored but the profile has Calendar disabled.

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
npm test -- tests/unit/profileStore.test.ts tests/unit/profile.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/profileStore.ts tests/unit/profileStore.test.ts src/shared/profile.ts tests/unit/profile.test.ts
git commit -m "feat: persist calendar profile surfaces"
```

---

### Task 3: Calendar URL Policy And Surface Start URLs

**Files:**
- Modify: `src/shared/urlPolicy.ts`
- Modify: `src/main/gmailViewController.ts`
- Test: `tests/unit/urlPolicy.test.ts`
- Test: `tests/unit/gmailViewController.test.ts`

- [ ] **Step 1: Write failing URL policy tests**

Add Calendar URL expectations:

```ts
// tests/unit/urlPolicy.test.ts
it("keeps Google Calendar URLs inside the app", () => {
  expect(classifyNavigationUrl("https://calendar.google.com/calendar/u/0/r")).toBe("internal");
  expect(classifyNavigationUrl("https://calendar.google.com/calendar/u/0/r/eventedit")).toBe("internal");
});
```

Add surface URL helper tests:

```ts
// tests/unit/gmailViewController.test.ts
import { getGoogleAppStartUrl, getPrimaryGoogleAppRecoveryUrl } from "../../src/main/gmailViewController";

it("returns start URLs for mail and calendar", () => {
  expect(getGoogleAppStartUrl("mail")).toContain("mail.google.com");
  expect(getGoogleAppStartUrl("calendar")).toBe("https://calendar.google.com/calendar/u/0/r");
});

it("recovers Calendar popup bootstrap pages to Calendar start URL", () => {
  expect(getPrimaryGoogleAppRecoveryUrl("about:blank", "calendar")).toBe(
    "https://calendar.google.com/calendar/u/0/r"
  );
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/unit/urlPolicy.test.ts tests/unit/gmailViewController.test.ts
```

Expected: FAIL because Calendar URLs and helpers are not implemented.

- [ ] **Step 3: Implement Calendar URL classification**

Update `src/shared/urlPolicy.ts` internal URL classification to treat `calendar.google.com` as internal:

```ts
function isGoogleCalendarUrl(url: URL): boolean {
  return url.protocol === "https:" && url.hostname === "calendar.google.com";
}
```

Include it in the existing internal decision:

```ts
if (isGmailUrl(url) || isGoogleCalendarUrl(url) || isGoogleAuthUrl(url)) {
  return "internal";
}
```

- [ ] **Step 4: Implement surface URL helpers**

In `src/main/gmailViewController.ts`, add:

```ts
const DEFAULT_CALENDAR_URL = "https://calendar.google.com/calendar/u/0/r";

export function getGoogleAppStartUrl(appKind: GoogleAppKind): string {
  return appKind === "calendar" ? DEFAULT_CALENDAR_URL : getConfiguredStartUrl();
}

export function getPrimaryGoogleAppRecoveryUrl(currentUrl: string, appKind: GoogleAppKind): string | null {
  const startUrl = getGoogleAppStartUrl(appKind);

  if (urlsMatch(currentUrl, startUrl)) {
    return null;
  }

  if (isPopupBootstrapUrl(currentUrl) || (appKind === "mail" && isGmailStandalonePopupUrl(currentUrl))) {
    return startUrl;
  }

  return null;
}
```

Keep `getPrimaryGmailRecoveryUrl` as a wrapper for existing tests:

```ts
export function getPrimaryGmailRecoveryUrl(currentUrl: string, startUrl: string): string | null {
  if (urlsMatch(currentUrl, startUrl)) {
    return null;
  }

  if (isPopupBootstrapUrl(currentUrl) || isGmailStandalonePopupUrl(currentUrl)) {
    return startUrl;
  }

  return null;
}
```

- [ ] **Step 5: Run tests to verify pass**

Run:

```bash
npm test -- tests/unit/urlPolicy.test.ts tests/unit/gmailViewController.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/urlPolicy.ts src/main/gmailViewController.ts tests/unit/urlPolicy.test.ts tests/unit/gmailViewController.test.ts
git commit -m "feat: allow calendar google surface urls"
```

---

### Task 4: Surface-Aware WebContentsView Controller

**Files:**
- Modify: `src/main/gmailViewController.ts`
- Test: `tests/unit/gmailViewController.test.ts`

- [ ] **Step 1: Write failing controller helper tests**

Add pure helper tests before changing the controller internals:

```ts
import { getProfileSwitchAction, getSurfaceCacheKey } from "../../src/main/gmailViewController";

it("uses independent cache keys for mail and calendar", () => {
  expect(getSurfaceCacheKey({ profileId: "work", appKind: "mail" })).toBe("work:mail");
  expect(getSurfaceCacheKey({ profileId: "work", appKind: "calendar" })).toBe("work:calendar");
});

it("creates a new view when a profile has mail cached but not calendar cached", () => {
  expect(getProfileSwitchAction(new Set(["work:mail"]), { profileId: "work", appKind: "calendar" })).toBe(
    "create-and-load"
  );
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/unit/gmailViewController.test.ts
```

Expected: FAIL because the controller still caches by profile only.

- [ ] **Step 3: Add surface cache helpers**

In `src/main/gmailViewController.ts`:

```ts
export function getSurfaceCacheKey(surface: ActiveGoogleSurface): `${string}:${GoogleAppKind}` {
  return `${surface.profileId}:${surface.appKind}`;
}

export function getProfileSwitchAction(
  cachedSurfaceKeys: ReadonlySet<string>,
  surface: ActiveGoogleSurface
): ProfileSwitchAction {
  return cachedSurfaceKeys.has(getSurfaceCacheKey(surface)) ? "activate-cached" : "create-and-load";
}
```

Update legacy tests that pass `profileId` to pass `{ profileId, appKind: "mail" }`.

- [ ] **Step 4: Make controller state surface-aware**

Change these fields:

```ts
private currentSurface: ActiveGoogleSurface | null = null;
private readonly surfaceViews = new Map<string, WebContentsView>();
```

Replace profile-only map access with surface keys:

```ts
const surface = { profileId: profile.id, appKind } satisfies ActiveGoogleSurface;
const surfaceKey = getSurfaceCacheKey(surface);
const switchAction = getProfileSwitchAction(new Set(this.surfaceViews.keys()), surface);
const view = switchAction === "activate-cached" ? this.surfaceViews.get(surfaceKey) : this.createSurfaceView(surface);
```

Add public methods:

```ts
async switchToSurface(surface: ActiveGoogleSurface): Promise<void> {
  const profile = this.store.getState().profiles.find((candidate) => candidate.id === surface.profileId);

  if (!profile) {
    throw new Error(`Profile not found: ${surface.profileId}`);
  }

  if (surface.appKind === "calendar" && !profile.calendarEnabled) {
    throw new Error(`Calendar is not enabled for profile: ${surface.profileId}`);
  }

  // Move existing switchToProfile body here, using surface instead of profile id.
}

async switchToProfile(profileId: string): Promise<void> {
  await this.switchToSurface({ profileId, appKind: "mail" });
}
```

When loading a new view:

```ts
await view.webContents.loadURL(getGoogleAppStartUrl(surface.appKind));
```

- [ ] **Step 5: Close surface-specific views**

Add:

```ts
closeSurfaceView(surface: ActiveGoogleSurface): void {
  ++this.switchToken;
  this.closeSurfaceViewByKey(getSurfaceCacheKey(surface));
}

closeProfileView(profileId: string): void {
  ++this.switchToken;

  for (const key of [...this.surfaceViews.keys()]) {
    if (key.startsWith(`${profileId}:`)) {
      this.closeSurfaceViewByKey(key);
    }
  }
}
```

Keep `clearProfileView()` closing all surfaces.

- [ ] **Step 6: Make refresh surface-aware**

Change `refreshCurrentView` to use `this.currentSurface?.appKind`:

```ts
const recoveryUrl = this.currentSurface
  ? getPrimaryGoogleAppRecoveryUrl(webContents.getURL(), this.currentSurface.appKind)
  : null;
```

- [ ] **Step 7: Run tests to verify pass**

Run:

```bash
npm test -- tests/unit/gmailViewController.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/main/gmailViewController.ts tests/unit/gmailViewController.test.ts
git commit -m "feat: cache google app surfaces independently"
```

---

### Task 5: IPC And Preload Surface API

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/renderer/api.ts`
- Test: `tests/unit/profileStore.test.ts`

- [ ] **Step 1: Write failing IPC type expectations**

Update `ProfileSwitchTarget` in `src/main/ipc.ts` to include the intended methods:

```ts
switchToSurface(surface: ActiveGoogleSurface): Promise<void>;
closeSurfaceView(surface: ActiveGoogleSurface): void;
```

This step is type-driven; `npm run typecheck` should fail until controller and IPC align.

- [ ] **Step 2: Add IPC channels**

Add to `profileIpcChannels`:

```ts
"profiles:setCalendarEnabled",
"profiles:switchSurface",
"appChrome:refreshCurrentSurface",
```

Add handlers:

```ts
ipcMain.handle("profiles:setCalendarEnabled", async (event, profileId: unknown, enabled: unknown) => {
  assertTrustedSender(event);
  const { store, target } = getRegistration();
  const id = requireString(profileId, "profileId");
  const isEnabled = requireBoolean(enabled, "enabled");
  const stateBeforeToggle = store.getState();
  const updatedProfile = store.setProfileCalendarEnabled(id, isEnabled);

  if (!isEnabled && stateBeforeToggle.lastActiveSurface?.profileId === id && stateBeforeToggle.lastActiveSurface.appKind === "calendar") {
    await target.switchToSurface({ profileId: id, appKind: "mail" });
  }

  if (!isEnabled) {
    target.closeSurfaceView({ profileId: id, appKind: "calendar" });
  }

  return updatedProfile;
});

ipcMain.handle("profiles:switchSurface", async (event, rawSurface: unknown) => {
  assertTrustedSender(event);
  const { store, target } = getRegistration();
  const surface = requireActiveSurface(rawSurface);

  store.setLastActiveSurface(surface);
  await target.switchToSurface(surface);
});

ipcMain.handle("appChrome:refreshCurrentSurface", (event) => {
  assertTrustedSender(event);
  getRegistration().target.refreshCurrentView();
});
```

Add:

```ts
function requireActiveSurface(value: unknown): ActiveGoogleSurface {
  if (!value || typeof value !== "object") {
    throw new Error("surface must be an object");
  }

  const surface = value as Record<string, unknown>;
  const profileId = requireString(surface.profileId, "profileId");
  const appKind = surface.appKind;

  if (appKind !== "mail" && appKind !== "calendar") {
    throw new Error("appKind must be mail or calendar");
  }

  return { profileId, appKind };
}
```

- [ ] **Step 3: Update preload and renderer API**

In `src/preload/preload.ts` and `src/renderer/api.ts`, add:

```ts
setProfileCalendarEnabled(profileId: string, enabled: boolean): Promise<GmailProfile>;
switchSurface(surface: ActiveGoogleSurface): Promise<void>;
refreshCurrentSurface(): Promise<void>;
```

Wire them to:

```ts
ipcRenderer.invoke("profiles:setCalendarEnabled", profileId, enabled)
ipcRenderer.invoke("profiles:switchSurface", surface)
ipcRenderer.invoke("appChrome:refreshCurrentSurface")
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts src/preload/preload.ts src/renderer/api.ts
git commit -m "feat: expose google surface ipc"
```

---

### Task 6: Renderer Active Surface State And Profile Switcher

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/ProfileSwitcher.tsx`
- Modify: `src/renderer/styles.css`
- Test: `tests/renderer/App.test.tsx`

- [ ] **Step 1: Write failing renderer tests**

Add tests:

```ts
it("shows calendar profile buttons only for calendar-enabled profiles", async () => {
  api.getProfileState.mockResolvedValueOnce({
    profiles: [
      makeProfile({ id: "work", displayName: "Work", calendarEnabled: true }),
      makeProfile({ id: "personal", displayName: "Personal", calendarEnabled: false })
    ],
    lastActiveProfileId: "work",
    lastActiveSurface: { profileId: "work", appKind: "mail" }
  });

  render(<App />);

  expect(await screen.findByRole("button", { name: "Switch to Work Gmail" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Switch to Work Calendar" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Switch to Personal Gmail" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Switch to Personal Calendar" })).not.toBeInTheDocument();
});

it("switches to the selected calendar surface", async () => {
  api.getProfileState.mockResolvedValue({
    profiles: [makeProfile({ id: "work", displayName: "Work", calendarEnabled: true })],
    lastActiveProfileId: "work",
    lastActiveSurface: { profileId: "work", appKind: "mail" }
  });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Switch to Work Calendar" }));

  await waitFor(() => {
    expect(api.switchSurface).toHaveBeenCalledWith({ profileId: "work", appKind: "calendar" });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/renderer/App.test.tsx
```

Expected: FAIL because ProfileSwitcher is profile-only.

- [ ] **Step 3: Update App active surface behavior**

In `src/renderer/App.tsx`, derive:

```ts
const activeSurface = state.lastActiveSurface ?? (
  state.lastActiveProfileId ? { profileId: state.lastActiveProfileId, appKind: "mail" as const } : null
);
```

Replace `switchProfile` with:

```ts
async function switchSurface(surface: ActiveGoogleSurface) {
  if (!surface.profileId || (surface.profileId === activeSurface?.profileId && surface.appKind === activeSurface.appKind)) {
    return;
  }

  try {
    await gmailClient.switchSurface(surface);
    await refreshState();
  } catch (caught) {
    setStatus(caught instanceof Error ? caught.message : "Unable to switch view");
    await refreshState({ clearStatus: false }).catch(() => undefined);
  }
}
```

Update refresh:

```ts
await gmailClient.refreshCurrentSurface();
```

- [ ] **Step 4: Update ProfileSwitcher props and rendering**

Use:

```ts
interface ProfileSwitcherProps {
  profiles: GmailProfile[];
  activeSurface: ActiveGoogleSurface | null;
  onSwitchSurface(surface: ActiveGoogleSurface): Promise<void>;
}
```

Render one Mail button for every profile and one Calendar button when enabled:

```tsx
const surfaces = profiles.flatMap((profile) => [
  { profile, appKind: "mail" as const },
  ...(profile.calendarEnabled ? [{ profile, appKind: "calendar" as const }] : [])
]);
```

Each button:

```tsx
<button
  key={`${profile.id}:${appKind}`}
  type="button"
  className="profile-avatar-button"
  aria-label={`Switch to ${label} ${getGoogleAppLabel(appKind)}`}
  aria-current={isActive ? "page" : undefined}
  title={`${label} ${getGoogleAppLabel(appKind)}`}
  onClick={() => void onSwitchSurface({ profileId: profile.id, appKind })}
>
  {avatar}
  <span className={`profile-app-badge profile-app-badge-${appKind}`} aria-hidden="true">
    {appKind === "calendar" ? "31" : "M"}
  </span>
</button>
```

- [ ] **Step 5: Add badge CSS**

Add to `src/renderer/styles.css`:

```css
.profile-avatar-button {
  position: relative;
}

.profile-app-badge {
  position: absolute;
  right: -3px;
  bottom: -3px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 2px solid var(--color-surface);
  border-radius: 6px;
  background: #fff;
  font-size: 8px;
  font-weight: 800;
  line-height: 1;
  box-shadow: 0 1px 3px rgb(15 23 42 / 24%);
}

.profile-app-badge-mail {
  color: #d93025;
}

.profile-app-badge-calendar {
  color: #1a73e8;
}
```

- [ ] **Step 6: Run tests to verify pass**

Run:

```bash
npm test -- tests/renderer/App.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/ProfileSwitcher.tsx src/renderer/styles.css tests/renderer/App.test.tsx
git commit -m "feat: render mail and calendar profile surfaces"
```

---

### Task 7: Settings Calendar Toggle

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/SettingsPage.tsx`
- Modify: `src/renderer/styles.css`
- Test: `tests/renderer/App.test.tsx`

- [ ] **Step 1: Write failing Settings tests**

Add:

```ts
it("enables calendar from profile settings", async () => {
  api.getProfileState.mockResolvedValue({
    profiles: [makeProfile({ id: "work", displayName: "Work", calendarEnabled: false })],
    lastActiveProfileId: "work",
    lastActiveSurface: { profileId: "work", appKind: "mail" }
  });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
  fireEvent.click(await screen.findByRole("switch", { name: "Enable Calendar for Work" }));

  await waitFor(() => {
    expect(api.setProfileCalendarEnabled).toHaveBeenCalledWith("work", true);
  });
});

it("switches back to mail when disabling the active calendar profile", async () => {
  api.getProfileState.mockResolvedValue({
    profiles: [makeProfile({ id: "work", displayName: "Work", calendarEnabled: true })],
    lastActiveProfileId: "work",
    lastActiveSurface: { profileId: "work", appKind: "calendar" }
  });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
  fireEvent.click(await screen.findByRole("switch", { name: "Enable Calendar for Work" }));

  await waitFor(() => {
    expect(api.setProfileCalendarEnabled).toHaveBeenCalledWith("work", false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/renderer/App.test.tsx
```

Expected: FAIL because Settings has no Calendar toggle.

- [ ] **Step 3: Add App handler**

In `src/renderer/App.tsx`:

```ts
async function setProfileCalendarEnabled(profileId: string, enabled: boolean) {
  try {
    await gmailClient.setProfileCalendarEnabled(profileId, enabled);
    await refreshState();
  } catch (caught) {
    setStatus(caught instanceof Error ? caught.message : "Unable to update Calendar setting");
    await refreshState({ clearStatus: false }).catch(() => undefined);
  }
}
```

Pass it into `SettingsPage`.

- [ ] **Step 4: Add SettingsPage prop and UI**

Add prop:

```ts
onSetProfileCalendarEnabled(profileId: string, enabled: boolean): Promise<void>;
```

In the selected profile detail card, add:

```tsx
<Separator />
<div className="account-app-settings">
  <div>
    <div className="account-app-title">Gmail</div>
    <div className="account-app-description">Always enabled for this profile.</div>
  </div>
  <Badge>On</Badge>
</div>
<label className="account-app-settings">
  <span>
    <span className="account-app-title">Calendar</span>
    <span className="account-app-description">Show Google Calendar as a top-bar surface for this profile.</span>
  </span>
  <input
    type="checkbox"
    role="switch"
    aria-label={`Enable Calendar for ${selectedProfile.displayName}`}
    checked={selectedProfile.calendarEnabled}
    onChange={(event) =>
      void onSetProfileCalendarEnabled(selectedProfile.id, event.currentTarget.checked)
    }
  />
</label>
```

- [ ] **Step 5: Add CSS**

```css
.account-app-settings {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}

.account-app-title {
  font-size: 13px;
  font-weight: 700;
}

.account-app-description {
  display: block;
  margin-top: 3px;
  color: var(--color-muted-foreground);
  font-size: 12px;
}
```

- [ ] **Step 6: Run tests to verify pass**

Run:

```bash
npm test -- tests/renderer/App.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/SettingsPage.tsx src/renderer/styles.css tests/renderer/App.test.tsx
git commit -m "feat: add calendar toggle to profile settings"
```

---

### Task 8: Startup Restore, Delete Cleanup, And E2E Smoke

**Files:**
- Modify: `src/main/createMainWindow.ts`
- Modify: `src/main/ipc.ts`
- Modify: `tests/e2e/electron-smoke.spec.ts`
- Test: `tests/unit/gmailViewController.test.ts`

- [ ] **Step 1: Update startup restore**

In `src/main/createMainWindow.ts`, replace last-active profile restore:

```ts
const lastActiveSurface = store.getState().lastActiveSurface;
if (lastActiveSurface) {
  await gmailViewController.switchToSurface(lastActiveSurface);
}
```

If no surface exists, preserve compatibility:

```ts
const lastActiveProfileId = store.getState().lastActiveProfileId;
if (!lastActiveSurface && lastActiveProfileId) {
  await gmailViewController.switchToProfile(lastActiveProfileId);
}
```

- [ ] **Step 2: Update delete cleanup**

In `src/main/ipc.ts`, profile delete already calls `target.closeProfileView(id)`. Ensure `closeProfileView(id)` closes both Mail and Calendar cached views after Task 4.

After deleting an active profile:

```ts
const nextSurface = store.getState().lastActiveSurface;
if (nextSurface) {
  await target.switchToSurface(nextSurface);
} else {
  target.clearProfileView();
}
```

- [ ] **Step 3: Write/update E2E smoke**

Extend `tests/e2e/electron-smoke.spec.ts` to verify Settings can enable Calendar and the top-bar Calendar button appears:

```ts
await window.getByRole("button", { name: "Settings" }).click();
await window.getByRole("switch", { name: "Enable Calendar for Work" }).click();
await window.getByRole("button", { name: "Back to mail" }).click();
await expect(window.getByRole("button", { name: "Switch to Work Calendar" })).toBeVisible();
```

If the current Settings page back button has a different accessible name, update the test to match the existing label rather than changing UI copy only for the test.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm test -- tests/unit/gmailViewController.test.ts tests/renderer/App.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Run E2E smoke if Electron can launch**

Run:

```bash
npm run test:e2e
```

Expected: PASS. If the local environment cannot launch Electron, record the exact failure in the final implementation notes and keep unit/renderer/typecheck green.

- [ ] **Step 7: Commit**

```bash
git add src/main/createMainWindow.ts src/main/ipc.ts tests/e2e/electron-smoke.spec.ts tests/unit/gmailViewController.test.ts tests/renderer/App.test.tsx
git commit -m "feat: restore and clean up active google surfaces"
```

---

### Task 9: Manual Verification And Polish

**Files:**
- Modify only if verification reveals issues: `src/renderer/styles.css`, `src/main/gmailViewController.ts`, `src/shared/urlPolicy.ts`

- [ ] **Step 1: Run the app**

Run:

```bash
npm run dev
```

Expected: Electron launches with the existing Gmail profiles.

- [ ] **Step 2: Verify Calendar enable flow**

Manual steps:

1. Open Settings.
2. Select a profile.
3. Enable Calendar.
4. Return to Mail.
5. Confirm the top bar now shows both `Profile Gmail` and `Profile Calendar`.
6. Click `Profile Calendar`.

Expected: Google Calendar loads in the main content area using the same Google account session when Google permits session reuse.

- [ ] **Step 3: Verify state preservation**

Manual steps:

1. In Mail, open a thread or search result.
2. Switch to Calendar.
3. Change Calendar view or date.
4. Switch back to Mail.
5. Switch back to Calendar.

Expected: Mail and Calendar views preserve their last in-page state within the app process.

- [ ] **Step 4: Verify input shortcut boundaries**

Manual steps:

1. Type in AI assistant and use Backspace.
2. Type in Gmail compose/search and use Backspace.
3. Focus a Gmail message list row and use Backspace.
4. Focus Calendar and use Backspace.

Expected:

- AI assistant text editing works.
- Gmail text editing works.
- Gmail mail delete shortcut still works.
- Calendar does not use the Gmail delete shortcut.

- [ ] **Step 5: Final full verification**

Run:

```bash
npm run typecheck
npm test
```

Expected: both PASS.

- [ ] **Step 6: Commit polish fixes if any**

If files changed during manual verification:

```bash
git add <changed-files>
git commit -m "fix: polish calendar surface behavior"
```

If no files changed, skip this commit.

---

## Self-Review

- Spec coverage: The plan covers Calendar opt-in, top-bar account/app buttons, shared profile session partition, independent view caching, refresh/recovery, URL policy, Settings toggle, delete cleanup, startup restore, and manual verification.
- Placeholder scan: The plan has no `TBD`, `TODO`, or unbounded "handle edge cases" instructions. Each implementation step names concrete files, commands, and expected results.
- Type consistency: The plan uses `GoogleAppKind`, `ActiveGoogleSurface`, `calendarEnabled`, `lastActiveSurface`, `switchSurface`, `setProfileCalendarEnabled`, and `refreshCurrentSurface` consistently across shared types, store, IPC, preload, renderer, and tests.
