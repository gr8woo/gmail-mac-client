# Calendar Surface Design

Date: 2026-05-19
Status: Approved for planning

## Summary

Add Google Calendar as an opt-in app surface inside the existing Gmail Mac Client. The app should keep Gmail profiles as the account-level primitive, then let each profile enable Calendar from Settings. When Calendar is enabled, the top profile bar shows a second icon for that same account: the same account avatar with a small Calendar badge. Mail keeps the Gmail badge.

The goal is not to replace Google Calendar's UI. Calendar V1 should host the real Google Calendar web app with the same profile session model already used for Gmail, then add native convenience around switching, refresh/recovery, and external-link handling.

## Goals

- Let a user enable Calendar per existing Gmail profile.
- Show Mail and Calendar as same-level app surfaces in the top profile bar.
- Reuse the same Google login session for a profile's Mail and Calendar surfaces.
- Preserve Mail and Calendar view state independently while switching.
- Keep Google Calendar's own web UI responsible for calendar navigation, event editing, invitations, and settings.
- Keep app-level behavior small: surface switching, profile/session reuse, refresh/recovery, and navigation policy.

## Non-Goals

- Build a custom calendar grid, agenda, event editor, or calendar API integration.
- Sync or store calendar events directly.
- Add calendar-aware AI workflows in V1.
- Create events from mail content in V1.
- Replace Google Calendar's notification or settings UX.
- Support Calendar-only profiles that do not have a Gmail profile.

## Product Model

Profiles remain account-level objects. A profile represents one isolated Google session partition and one user-visible account identity, including display name, email, and avatar metadata.

Calendar is an optional app capability on each profile:

- Gmail is always enabled.
- Calendar defaults to disabled for existing and newly created profiles.
- Settings can enable or disable Calendar per profile.
- Enabling Calendar adds a top-bar `profile + calendar` icon.
- Disabling Calendar removes only the Calendar icon and view cache; the profile and Gmail surface remain intact.

The active surface is a pair:

```ts
type GoogleAppKind = "mail" | "calendar";

interface ActiveGoogleSurface {
  profileId: string;
  appKind: GoogleAppKind;
}
```

## UI

### Top Profile Bar

The top bar displays account/app combinations rather than account-only buttons.

- Every profile always renders a Mail button.
- Profiles with Calendar enabled also render a Calendar button.
- The main circular avatar remains the account image or fallback initial.
- A small bottom-right badge identifies the app surface.
- The Mail badge should visually reference Gmail.
- The Calendar badge should visually reference Google Calendar.
- The active account/app combination uses the existing active-ring treatment.
- Accessible labels should read like `Work Gmail` and `Work Calendar`.

The visual direction is: account identity first, app identity second. This keeps the UI compact while making same-account Mail and Calendar buttons distinguishable.

### Settings

Settings > Profiles should gain an app surface section for the selected profile.

- Gmail appears as enabled and locked.
- Calendar appears as an `Enable Calendar` toggle.
- Turning Calendar on creates no new account or login; it uses the selected profile session.
- Turning Calendar off removes the Calendar top-bar button.
- If the user is currently viewing that profile's Calendar surface, disabling Calendar should switch them back to the same profile's Mail surface.

### Refresh

The existing refresh button should operate on the current active surface:

- Mail refreshes or recovers the current Gmail view.
- Calendar refreshes or recovers the current Calendar view.

### AI Assistant

The AI assistant panel remains available from either surface. Calendar V1 does not add Calendar context extraction or event-writing actions. Existing mail-context behavior should remain mail-oriented; Calendar-specific assistant behavior can be added later.

## Architecture

The current `GmailViewController` should be generalized rather than extended as a Gmail-only class. A name such as `GoogleWorkspaceViewController` better matches the product model.

The controller owns `WebContentsView` lifecycle for Google app surfaces. Each cached view is keyed by profile and app kind:

```ts
type SurfaceKey = `${string}:${GoogleAppKind}`;
```

Session partitions remain profile-scoped, not app-scoped:

- `Work + Gmail` uses `persist:gmail-profile-work`.
- `Work + Calendar` uses the same partition.

This allows Google login state to carry naturally between Gmail and Calendar for the same profile, while different profiles remain isolated.

## URLs And Navigation

Mail starts at the existing Gmail start URL. Calendar starts at Google Calendar:

```text
https://calendar.google.com/calendar/u/0/r
```

The URL policy should treat the following as internal Google app/auth surfaces:

- Gmail mail URLs.
- Calendar URLs on `calendar.google.com`.
- Existing Google account and login URLs needed for authentication.

External, non-Google application links should continue opening in the user's default browser.

Calendar recovery should mirror Gmail recovery at a surface level: if the Calendar view is replaced by a popup bootstrap or unsupported standalone page, return it to the configured Calendar start URL.

## Data Model

Extend `GmailProfile` with a Calendar flag:

```ts
interface GmailProfile {
  id: string;
  displayName: string;
  partition: string;
  createdAt: string;
  updatedAt: string;
  email?: string;
  avatarUrl?: string;
  calendarEnabled: boolean;
}
```

Existing profile store data should migrate missing `calendarEnabled` values to `false`.

The active surface should eventually replace account-only last-active state:

```ts
interface ProfileState {
  profiles: GmailProfile[];
  lastActiveProfileId: string | null;
  lastActiveSurface?: ActiveGoogleSurface | null;
}
```

For compatibility, `lastActiveProfileId` can remain during migration. If `lastActiveSurface` is missing, the app should restore the last active profile's Mail surface.

## View State

Mail and Calendar views should remain cached independently for the lifetime of the app process. Switching from Mail to Calendar should detach the current view and attach the target view without destroying either one. This preserves scroll position, selected Gmail thread, selected Calendar view, and currently visible date range as much as Google web apps allow.

When a profile is deleted, all cached views for that profile should be closed. When Calendar is disabled for a profile, only that profile's Calendar view should be closed.

## Error Handling

- If Calendar fails to load, show the same status/error surface used for Gmail load failures.
- If Calendar is disabled while active, switch to Mail before closing the Calendar view.
- If the active surface points to a disabled Calendar surface during startup, fall back to that profile's Mail surface.
- If URL policy denies a Calendar popup URL, log enough context to diagnose allowlist gaps without exposing account credentials.

## Testing

Unit and renderer tests should cover:

- `calendarEnabled` defaulting and persistence.
- Migration of existing profile JSON without `calendarEnabled`.
- Settings toggle behavior.
- Top profile bar rendering Mail for all profiles and Calendar only for enabled profiles.
- Active surface switching between Mail and Calendar.
- Closing Calendar view cache when Calendar is disabled.
- Closing both Mail and Calendar view caches when a profile is deleted.
- Calendar URL classification and external-link handling.
- Refresh dispatching to the active surface.

Manual verification should cover:

- Enabling Calendar for a signed-in Gmail profile opens Calendar without a separate login when Google permits the shared session.
- Mail and Calendar preserve their visible state across switching.
- AI assistant text editing still works while Calendar is active.
- Gmail Backspace delete behavior still works only inside Gmail, not in app shell inputs.

## Risks

- The current Gmail controller is already large. Generalizing it should be done carefully to avoid mixing Gmail-only recovery logic into Calendar behavior.
- Google Calendar may use popup or navigation flows that differ from Gmail, requiring URL policy additions.
- Top-bar icon count can double. With five profiles and Calendar enabled everywhere, the app can show ten account/app buttons, so overflow handling may be needed.
- Google brand icon usage is acceptable for local/internal use, but public distribution should check Google brand guidelines.

## Done Criteria

Calendar V1 is done when:

- A user can enable Calendar for a profile in Settings.
- The top bar shows a Calendar-badged account icon for enabled profiles.
- Clicking a Calendar-badged icon opens Google Calendar in the main content area.
- Mail and Calendar use the same profile session partition.
- Mail and Calendar views remain independently cached while switching.
- Refresh works against the active surface.
- Calendar internal navigation stays in the app and external links open in the default browser.
- Disabling Calendar removes the Calendar surface and safely returns the user to Mail if needed.
