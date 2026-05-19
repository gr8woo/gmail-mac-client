# Simple Gmail Client App Store Release Checklist

## Current Release Identity

- App display name: Simple Gmail Client
- Bundle ID: `com.gr8woo.simplegmailclient`
- Category: Productivity
- Distribution target: Mac App Store (`electron-builder --mac mas`)

## Build Commands

```bash
npm run typecheck
npm test
npm run test:e2e
npm run dist:mac
npm run dist:mas
```

`dist:mac` intentionally disables identity auto-discovery so local unsigned directory builds remain easy. `dist:mas` requires Apple signing assets to be installed locally.

## Apple Developer Setup

- [ ] Enroll in the Apple Developer Program.
- [ ] Create an App Store Connect macOS app record for `com.gr8woo.simplegmailclient`.
- [ ] Create/download the Mac App Store distribution provisioning profile for this bundle ID.
- [ ] Install the `3rd Party Mac Developer Application` and `3rd Party Mac Developer Installer` certificates.
- [ ] Set `CSC_NAME` if multiple signing identities are installed, so `electron-builder` does not pick a Developer ID certificate.
- [ ] Verify the bundle ID in `electron-builder.yml` matches App Store Connect exactly.
- [ ] Build the MAS artifact with `npm run dist:mas`.
- [ ] Upload through Transporter or App Store Connect tooling.

Current local blocker: `npm run dist:mas` downloads the Electron MAS runtime successfully, then fails during codesign because the machine has no valid `3rd Party Mac Developer Application` identity. Install/select that identity and a matching provisioning profile before the next MAS build attempt.

## Required App Store Metadata

- [ ] App name, subtitle, keywords, support URL, marketing URL.
- [ ] Privacy policy URL.
- [ ] App privacy answers for Google account web content and any local AI provider behavior.
- [ ] Updated age rating answers.
- [ ] Export compliance answers for HTTPS/TLS usage.
- [ ] Review notes explaining that the app stores only local profile metadata and loads Google services in isolated Electron sessions.

## Review Risks To Resolve Before Submission

- [ ] Trademark risk: Apple review guidance warns against protected third-party names in app names/metadata without approval. `Simple Gmail Client` includes the Gmail trademark, so confirm permission or consider a safer App Store-facing name.
- [ ] Third-party service risk: confirm Google/Gmail/Calendar terms allow this client wrapper and include any required disclosure in review notes.
- [ ] Local AI CLI risk: the current AI assistant can invoke local Claude/Codex command-line tools. A Mac App Store sandbox build may block or be rejected for this behavior. Decide whether to remove, hide, or replace this feature for MAS builds.
- [ ] Icon risk: ensure the app icon does not use Google/Gmail/Calendar protected artwork unless licensed.

## Pre-Submit Verification

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run test:e2e`
- [ ] Launch the signed MAS build locally.
- [ ] Verify Gmail login and profile isolation.
- [ ] Verify Calendar opt-in, Calendar switching, and Calendar disable fallback.
- [ ] Verify AI assistant behavior or confirm it is disabled for MAS.
- [ ] Confirm app sandbox container paths preserve profiles and Google sessions.
- [ ] Confirm external links open in the default browser.

## Rollback Triggers

- App fails to launch after signing.
- Gmail or Calendar session cannot persist across restarts.
- App Store upload validation rejects entitlements or bundle metadata.
- App Review rejects the name, icon, Google service usage, or local CLI integration.
