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
npm run dist:mac:dir
npm run dist:mas
```

`dist:mac` is the public GitHub release build. It must produce signed and notarized `dmg`/`zip` artifacts. `mac.forceCodeSigning: true` requires signing, but electron-builder 25.1.8 can SKIP notarization when no notarization credentials are configured even with `mac.notarize: true`. A successful packaging command alone is NOT release approval: require a successful notarization result, stapled-ticket validation, and Gatekeeper acceptance before distributing. Use `--publish never` while preparing a local candidate.

`dist:mac:dir` is the local unsigned directory build for development only. It explicitly disables signing, hardened runtime, and notarization, and its output should not be uploaded to GitHub Releases.

`dist:mas` requires Apple signing assets to be installed locally.

## GitHub Release Signing And Notarization

- [ ] Install or provide a `Developer ID Application` certificate for non-App-Store macOS distribution.
- [ ] Set `CSC_LINK` and `CSC_KEY_PASSWORD`, or install the certificate locally and set `CSC_NAME` when multiple identities are present.
- [ ] Set Apple notarization credentials for electron-builder, such as `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`.
- [ ] Build with `npm run dist:mac`.
- [ ] Verify the app bundle before uploading:

```bash
codesign --verify --deep --strict --verbose=4 "release/mac-arm64/Simple Gmail Client.app"
spctl -a -vvv -t execute "release/mac-arm64/Simple Gmail Client.app"
```

`spctl` should report an accepted Developer ID source. If it does not, do not upload the artifact.

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


## In-app automatic updater (November 2026)

The new implementation uses pinned `electron-updater` 6.8.12 and Squirrel.Mac.
It preserves the existing app ID, userData directory and profile partitions.

- Startup checks only: no background downloads or installation on ordinary app quit.
- The existing button displays **업데이트·재시작** and a visible warning to save mail.
- One click downloads, verifies through electron-updater/Squirrel, applies and relaunches.
  No extra confirmation dialog. Web Gmail draft-save state cannot reliably be detected;
  the visible pre-click warning is important. Users should not start composing during download.
- AI operations block the initial install action. AI started during download postpones
  application until the user clicks again after work is done. New AI calls are rejected
  during native verification/restart.
- Main-process single-flight state prevents repeat clicks/renderer reload duplicate installs.
- Native installation errors require app restart before retry, avoiding duplicate Squirrel
  installation listeners. Download/check errors allow ordinary retry.
- Development, E2E, MAS, unsigned and preview bundle IDs are rejected before querying
  the production feed. Production bundles must have Developer ID signing and pass
  codesign verification. Never bypass signature verification or strip quarantine.
- `src/main/updateService.ts` remains only as a legacy/manual implementation tested
  separately; it is no longer exposed by IPC or used by the app UI.

### First rollout and required assets

Installed v0.1.6 lacks this automatic replacement code. The migration release must be
installed manually once. Subsequent versions can use the one-click path. Bump versions
before a release; do not reuse v0.1.6 for a newer build.

Publish ZIP, DMG, matching `latest-mac.yml` (and generated blockmaps) together from the
same signed/notarized build. Current public v0.1.6 contains only a DMG, so it is **not**
a working electron-updater feed. The old local latest-mac.yml does not match the posted
DMG and must not be reused. Publish configuration defaults to a draft release.

Choose the authorized signing owner before building. This computer has ZIGBANG
Developer ID identities and a personal Apple Development identity. Apple Development
is NOT a Developer ID Application distribution identity. Existing installation is signed
by ZIGBANG; that observation does not authorize using the company's certificate.
Changing the signing owner should be done in the initial manual migration, then tested.

Pinning updater 6.x avoids an unrelated builder 27 migration. Update-manifest signatures
available in newer builder/updater versions are not enabled by this change. HTTPS,
manifest checksums and native macOS application signature verification are retained.

### Validation completed / still needed

Unit tests cover no-update, duplicate clicks, progress, unsupported builds, download
failure/retry, AI work before/during download, and native signing errors. Renderer tests,
type checks, build and disposable-profile Electron smoke tests are required after edits.
No signed release was created, published, downloaded or installed by this implementation.
A real signed version A → version B upgrade, profile/session persistence, Gatekeeper,
interrupted download and signing-mismatch integration checks remain release gates.

## v0.1.7 explicit notarization exception

The owner explicitly requested a signed release without Apple notarization for v0.1.7. This is a one-release exception, not a change to the default notarized build policy. Build with `--publish never -c.mac.notarize=false`, retain Developer ID signing, disclose the missing notarization in release notes, and do not remove quarantine or disable Gatekeeper. Browser-downloaded copies may be blocked.
