import { BrowserWindow, WebContentsView, shell } from "electron";
import type { BrowserWindowConstructorOptions } from "electron";
import type { Event, Input, Rectangle, WebContents } from "electron";
import type { GmailPageContext } from "../shared/agent";
import { getPartitionName } from "../shared/profile";
import type { ActiveGoogleSurface, GoogleAppKind } from "../shared/profile";
import { classifyNavigationUrl } from "../shared/urlPolicy";
import type { FileProfileStore } from "./profileStore";
import {
  createGmailActionScript,
  createGmailShortcutGuardScript,
  getGmailShortcutKey,
  getOutlookShortcutAction,
  type OutlookShortcutAction
} from "./outlookShortcuts";

export const APP_BAR_HEIGHT = 44;
const DEFAULT_GMAIL_URL =
  "https://accounts.google.com/v3/signin/identifier?service=mail&continue=https%3A%2F%2Fmail.google.com%2Fmail%2Fu%2F0%2F&followup=https%3A%2F%2Fmail.google.com%2Fmail%2Fu%2F0%2F&flowName=GlifWebSignIn&flowEntry=ServiceLogin";
const DEFAULT_CALENDAR_URL = "https://calendar.google.com/calendar/u/0/r";
const SAFARI_COMPATIBLE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
const GOOGLE_ACCOUNT_METADATA_SCRIPT = `
(() => {
  const candidates = [
    ...document.querySelectorAll('[aria-label*="Google 계정"], [aria-label*="Google Account"], a[href*="SignOutOptions"]')
  ];
  const element = candidates.find((candidate) => {
    const label = candidate.getAttribute("aria-label") || candidate.textContent || "";
    return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i.test(label);
  }) || candidates[0] || null;
  const image = element?.querySelector("img[src]") || document.querySelector('img[src*="googleusercontent"]');

  return {
    label: element?.getAttribute("aria-label") || element?.textContent || "",
    imageUrl: image?.getAttribute("src") || ""
  };
})()
`;
const GMAIL_PAGE_CONTEXT_SCRIPT = `
(() => {
  const text = (element) => (element?.textContent || "").replace(/\\s+/g, " ").trim();
  const subject =
    text(document.querySelector("h2.hP")) ||
    text(document.querySelector('h2[data-thread-perm-id]')) ||
    text(document.querySelector("[data-thread-id] h2")) ||
    text(document.querySelector('div[role="main"] h2'));
  const senderElement =
    document.querySelector("span[email]") ||
    document.querySelector("[email]") ||
    document.querySelector(".gD");
  const sender =
    senderElement?.getAttribute("email") ||
    senderElement?.getAttribute("name") ||
    text(senderElement);
  const bodyCandidates = [
    ...document.querySelectorAll("div.a3s"),
    ...document.querySelectorAll('div[role="main"] [dir="ltr"]')
  ];
  const body = bodyCandidates
    .map((candidate) => candidate.innerText || candidate.textContent || "")
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\\n\\n");

  return {
    title: document.title || "",
    url: location.href,
    subject,
    sender,
    body
  };
})()
`;
type WindowOpenDisposition =
  | { action: "allow-popup"; url: string }
  | { action: "load-in-view"; url: string }
  | { action: "open-external"; url: string }
  | { action: "deny" };
type ProfileSwitchAction = "activate-cached" | "create-and-load";
export interface GmailProfileMetadata {
  email: string;
  avatarUrl?: string;
}

interface RawGoogleAccountMetadata {
  label?: unknown;
  imageUrl?: unknown;
}

interface GmailViewControllerOptions {
  startUrl?: string;
  allowedPolicyBypassUrl?: string | null;
  onProfileMetadata?(profileId: string, metadata: GmailProfileMetadata): void;
}

export class GmailViewController {
  private currentView: WebContentsView | null = null;
  private currentSurface: ActiveGoogleSurface | null = null;
  private currentViewAttached = false;
  private gmailViewVisible = true;
  private forwardingEditingInput = false;
  private readonly surfaceViews = new Map<string, WebContentsView>();
  private switchToken = 0;
  private topInset = APP_BAR_HEIGHT;
  private rightInset = 0;
  private readonly startUrl: string;
  private readonly allowedPolicyBypassUrl: string | null;
  private readonly onProfileMetadata: ((profileId: string, metadata: GmailProfileMetadata) => void) | undefined;
  private readonly layoutCurrentView = () => this.layout();
  private readonly closeCurrentViewWhenWindowCloses = () => {
    this.window.off("resize", this.layoutCurrentView);
    this.closeAllProfileViews();
  };

  constructor(
    private readonly window: BrowserWindow,
    private readonly store: FileProfileStore,
    options: GmailViewControllerOptions = {}
  ) {
    this.startUrl = options.startUrl ?? getConfiguredStartUrl();
    this.allowedPolicyBypassUrl = options.allowedPolicyBypassUrl ?? getAllowedPolicyBypassUrl(this.startUrl);
    this.onProfileMetadata = options.onProfileMetadata;
  }

  attach(): void {
    this.window.on("resize", this.layoutCurrentView);
    this.window.once("closed", this.closeCurrentViewWhenWindowCloses);
  }

  async switchToProfile(profileId: string): Promise<void> {
    await this.switchToSurface({ profileId, appKind: "mail" });
  }

  async switchToSurface(surface: ActiveGoogleSurface): Promise<void> {
    const activeSurface = copySurface(surface);
    const profile = this.store.getState().profiles.find((candidate) => candidate.id === activeSurface.profileId);

    if (!profile) {
      throw new Error(`Profile not found: ${activeSurface.profileId}`);
    }

    if (activeSurface.appKind === "calendar" && !profile.calendarEnabled) {
      throw new Error(`Calendar is not enabled for profile: ${activeSurface.profileId}`);
    }

    const token = ++this.switchToken;
    const surfaceKey = getSurfaceCacheKey(activeSurface);

    if (this.currentSurface && getSurfaceCacheKey(this.currentSurface) === surfaceKey && this.currentView) {
      this.layout();
      return;
    }

    this.detachCurrentView();

    const switchAction = getProfileSwitchAction(new Set(this.surfaceViews.keys()), activeSurface);
    const view =
      switchAction === "activate-cached" ? this.surfaceViews.get(surfaceKey) : this.createSurfaceView(activeSurface);

    if (!view) {
      throw new Error(`Surface view not found: ${surfaceKey}`);
    }

    this.currentSurface = copySurface(activeSurface);
    this.currentView = view;
    this.attachCurrentViewIfVisible();

    if (switchAction === "activate-cached") {
      return;
    }

    try {
      await view.webContents.loadURL(this.getSurfaceStartUrl(activeSurface.appKind));
    } catch (error) {
      if (isIgnorableLoadError(error)) {
        return;
      }

      if (token === this.switchToken && getLiveWebContents(view)) {
        throw error;
      }
    }
  }

  private createSurfaceView(surface: ActiveGoogleSurface): WebContentsView {
    const viewSurface = copySurface(surface);
    const view = new WebContentsView({
      webPreferences: {
        partition: getPartitionName(viewSurface.profileId),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });

    view.webContents.setUserAgent(getGoogleCompatibleUserAgent(view.webContents.getUserAgent()));

    view.webContents.setWindowOpenHandler(({ url }) => {
      const disposition = getWindowOpenDisposition(url);
      debugNavigation(`window-open:${disposition.action}`, url);

      if (disposition.action === "allow-popup") {
        return {
          action: "allow",
          overrideBrowserWindowOptions: createGmailPopupWindowOptions(viewSurface.profileId)
        };
      }

      if (disposition.action === "load-in-view") {
        void view.webContents.loadURL(disposition.url).catch((error: unknown) => {
          if (!isIgnorableLoadError(error)) {
            console.error(error);
          }
        });
      } else if (disposition.action === "open-external") {
        void shell.openExternal(disposition.url);
      }

      return { action: "deny" };
    });

    view.webContents.on("did-create-window", (childWindow) => {
      protectGmailPopupWindow(childWindow, viewSurface.profileId, this.allowedPolicyBypassUrl);
    });

    view.webContents.on("will-navigate", (event, url) => {
      applyNavigationPolicy(event, url, this.allowedPolicyBypassUrl);
    });

    view.webContents.on("before-input-event", (event, input) => {
      if (viewSurface.appKind === "mail") {
        this.handleShortcutInput(event, input);
      }
    });

    view.webContents.on("did-navigate", (_event, url) => {
      debugNavigation("did-navigate", url);
      this.restorePrimaryGoogleAppViewIfNeeded(url, viewSurface, view);
      this.scheduleProfileMetadataCapture(viewSurface);
    });

    view.webContents.on("did-navigate-in-page", (_event, url) => {
      debugNavigation("did-navigate-in-page", url);
      this.restorePrimaryGoogleAppViewIfNeeded(url, viewSurface, view);
      this.scheduleProfileMetadataCapture(viewSurface);
    });

    view.webContents.on("did-finish-load", () => {
      this.scheduleProfileMetadataCapture(viewSurface);
    });

    view.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (isMainFrame) {
        debugNavigation(`did-fail-load:${errorCode}:${errorDescription}`, validatedUrl);
      }
    });

    view.webContents.on("will-redirect", (event, url, _isInPlace, isMainFrame) => {
      if (isMainFrame) {
        applyNavigationPolicy(event, url, this.allowedPolicyBypassUrl);
      } else {
        debugNavigation("allow-subframe-redirect", url);
      }
    });

    this.surfaceViews.set(getSurfaceCacheKey(viewSurface), view);
    return view;
  }

  layout(): void {
    if (!this.currentView || !this.currentViewAttached) {
      return;
    }

    this.currentView.setBounds(getGmailBounds(this.window.getContentBounds(), this.topInset, this.rightInset));
  }

  setTopInset(height: number): void {
    this.topInset = Math.max(APP_BAR_HEIGHT, Math.round(height));
    this.layout();
  }

  setGmailViewVisible(visible: boolean): void {
    this.gmailViewVisible = visible;

    if (visible) {
      this.attachCurrentViewIfVisible();
      return;
    }

    this.detachCurrentViewFromWindow();
  }

  setRightInset(width: number): void {
    this.rightInset = Math.max(0, Math.round(width));
    this.layout();
  }

  refreshCurrentView(): void {
    const webContents = this.currentView ? getLiveWebContents(this.currentView) : null;

    if (!webContents) {
      return;
    }

    const recoveryUrl = this.currentSurface
      ? this.getSurfaceRecoveryUrl(webContents.getURL(), this.currentSurface.appKind)
      : null;
    if (recoveryUrl) {
      void webContents.loadURL(recoveryUrl).catch((error: unknown) => {
        if (!isIgnorableLoadError(error)) {
          console.error(error);
        }
      });
      return;
    }

    webContents.reload();
  }

  async getCurrentPageContext(): Promise<GmailPageContext | null> {
    const webContents = this.currentView ? getLiveWebContents(this.currentView) : null;

    if (!webContents) {
      return null;
    }

    const rawContext = (await webContents.executeJavaScript(GMAIL_PAGE_CONTEXT_SCRIPT, true)) as unknown;
    return parseGmailPageContext(rawContext);
  }

  handleShortcutInput(event: Event, input: Input): boolean {
    if (this.forwardingEditingInput || this.currentSurface?.appKind !== "mail") {
      return false;
    }

    const action = getOutlookShortcutAction(input);

    if (!action) {
      return false;
    }

    event.preventDefault();
    void this.triggerCurrentGmailAction(action, input.key).catch((error: unknown) => {
      console.error(error);
    });
    return true;
  }

  triggerDeleteShortcut(originalKey = "Backspace"): void {
    if (this.currentSurface?.appKind !== "mail") {
      return;
    }

    void this.triggerCurrentGmailAction("delete", originalKey).catch((error: unknown) => {
      console.error(error);
    });
  }

  clearProfileView(): void {
    ++this.switchToken;
    this.closeAllProfileViews();
  }

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

  private detachCurrentView(): void {
    if (!this.currentView) {
      return;
    }

    this.detachCurrentViewFromWindow();
    this.currentView = null;
    this.currentSurface = null;
  }

  private attachCurrentViewIfVisible(): void {
    if (!this.gmailViewVisible || !this.currentView || this.currentViewAttached || this.window.isDestroyed()) {
      return;
    }

    ignoreDestroyedObjectError(() => {
      this.window.contentView.addChildView(this.currentView as WebContentsView);
      this.currentViewAttached = true;
    });
    this.layout();
  }

  private detachCurrentViewFromWindow(): void {
    if (!this.currentView || !this.currentViewAttached) {
      return;
    }

    if (!this.window.isDestroyed()) {
      ignoreDestroyedObjectError(() => {
        this.window.contentView.removeChildView(this.currentView as WebContentsView);
      });
    }

    this.currentViewAttached = false;
  }

  private closeSurfaceViewByKey(surfaceKey: string): void {
    const view = this.surfaceViews.get(surfaceKey);

    if (!view) {
      return;
    }

    if (this.currentSurface && getSurfaceCacheKey(this.currentSurface) === surfaceKey) {
      this.detachCurrentView();
    }

    this.surfaceViews.delete(surfaceKey);

    const webContents = getLiveWebContents(view);
    if (webContents) {
      ignoreDestroyedObjectError(() => {
        webContents.close();
      });
    }
  }

  private closeAllProfileViews(): void {
    const surfaceKeys = [...this.surfaceViews.keys()];

    for (const surfaceKey of surfaceKeys) {
      this.closeSurfaceViewByKey(surfaceKey);
    }

    this.currentView = null;
    this.currentSurface = null;
  }

  private scheduleProfileMetadataCapture(surface: ActiveGoogleSurface): void {
    if (!this.onProfileMetadata) {
      return;
    }

    for (const delayMs of [0, 1000, 3000]) {
      setTimeout(() => {
        void this.captureProfileMetadata(surface).catch((error: unknown) => {
          if (!isDestroyedObjectError(error)) {
            debugNavigation("metadata-capture-failed", error instanceof Error ? error.message : String(error));
          }
        });
      }, delayMs);
    }
  }

  private async captureProfileMetadata(surface: ActiveGoogleSurface): Promise<void> {
    const view = this.surfaceViews.get(getSurfaceCacheKey(surface));
    const webContents = view ? getLiveWebContents(view) : null;

    if (!webContents) {
      return;
    }

    const rawMetadata = (await webContents.executeJavaScript(GOOGLE_ACCOUNT_METADATA_SCRIPT, true)) as unknown;
    const metadata = parseGoogleAccountMetadata(rawMetadata);

    if (metadata) {
      this.onProfileMetadata?.(surface.profileId, metadata);
    }
  }

  private async triggerCurrentGmailAction(action: OutlookShortcutAction, originalKey?: string): Promise<void> {
    if (this.currentSurface?.appKind !== "mail") {
      return;
    }

    const webContents = this.currentView ? getLiveWebContents(this.currentView) : null;

    if (!webContents) {
      return;
    }

    await triggerGmailAction(webContents, action, originalKey, (key) => {
      this.forwardEditingKey(webContents, key);
    });
  }

  private forwardEditingKey(webContents: WebContents, originalKey: string | undefined): void {
    if (!originalKey || webContents.isDestroyed()) {
      return;
    }

    this.forwardingEditingInput = true;

    try {
      webContents.sendInputEvent({ type: "keyDown", keyCode: originalKey });
      webContents.sendInputEvent({ type: "keyUp", keyCode: originalKey });
    } finally {
      this.forwardingEditingInput = false;
    }
  }

  private restorePrimaryGoogleAppViewIfNeeded(
    url: string,
    surface: ActiveGoogleSurface,
    view: WebContentsView
  ): void {
    const recoveryUrl = this.getSurfaceRecoveryUrl(url, surface.appKind);
    const webContents = getLiveWebContents(view);

    if (!recoveryUrl || !webContents) {
      return;
    }

    debugNavigation("recover-primary-view", `${url} -> ${recoveryUrl}`);
    void webContents.loadURL(recoveryUrl).catch((error: unknown) => {
      if (!isIgnorableLoadError(error)) {
        console.error(error);
      }
    });
  }

  private getSurfaceStartUrl(appKind: GoogleAppKind): string {
    return appKind === "calendar" ? getGoogleAppStartUrl("calendar") : this.startUrl;
  }

  private getSurfaceRecoveryUrl(currentUrl: string, appKind: GoogleAppKind): string | null {
    return appKind === "calendar"
      ? getPrimaryGoogleAppRecoveryUrl(currentUrl, "calendar")
      : getPrimaryGmailRecoveryUrl(currentUrl, this.startUrl);
  }
}

export function getGmailBounds(bounds: Rectangle, topInset = APP_BAR_HEIGHT, rightInset = 0): Rectangle {
  return {
    x: 0,
    y: topInset,
    width: Math.max(0, bounds.width - Math.max(0, rightInset)),
    height: Math.max(0, bounds.height - topInset)
  };
}

export function getSurfaceCacheKey(surface: ActiveGoogleSurface): `${string}:${GoogleAppKind}` {
  return `${surface.profileId}:${surface.appKind}`;
}

function copySurface(surface: ActiveGoogleSurface): ActiveGoogleSurface {
  return {
    profileId: surface.profileId,
    appKind: surface.appKind
  };
}

export function getProfileSwitchAction(
  cachedSurfaceKeys: ReadonlySet<string>,
  surface: ActiveGoogleSurface
): ProfileSwitchAction {
  return cachedSurfaceKeys.has(getSurfaceCacheKey(surface)) ? "activate-cached" : "create-and-load";
}

export function getWindowOpenDisposition(rawUrl: string): WindowOpenDisposition {
  if (isPopupBootstrapUrl(rawUrl) || isGmailMailUrl(rawUrl)) {
    return { action: "allow-popup", url: rawUrl };
  }

  const decision = classifyNavigationUrl(rawUrl);

  if (decision === "internal") {
    return { action: "load-in-view", url: rawUrl };
  }

  if (decision === "external") {
    return { action: "open-external", url: rawUrl };
  }

  return { action: "deny" };
}

export function getPrimaryGmailRecoveryUrl(currentUrl: string, startUrl: string): string | null {
  if (urlsMatch(currentUrl, startUrl)) {
    return null;
  }

  if (isPopupBootstrapUrl(currentUrl) || isGmailStandalonePopupUrl(currentUrl)) {
    return startUrl;
  }

  return null;
}

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

function isPopupBootstrapUrl(rawUrl: string): boolean {
  return rawUrl === "about:blank";
}

function isGmailMailUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && url.hostname === "mail.google.com" && url.pathname.startsWith("/mail/");
  } catch {
    return false;
  }
}

function isGmailStandalonePopupUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return isGmailMailUrl(rawUrl) && new Set(["cm", "om", "pt"]).has(url.searchParams.get("view") ?? "");
  } catch {
    return false;
  }
}

function urlsMatch(left: string, right: string): boolean {
  try {
    return new URL(left).href === new URL(right).href;
  } catch {
    return left === right;
  }
}

export function parseGoogleAccountMetadata(rawMetadata: unknown): GmailProfileMetadata | null {
  if (!rawMetadata || typeof rawMetadata !== "object") {
    return null;
  }

  const accountMetadata = rawMetadata as RawGoogleAccountMetadata;
  const label = typeof accountMetadata.label === "string" ? accountMetadata.label : "";
  const imageUrl = typeof accountMetadata.imageUrl === "string" ? accountMetadata.imageUrl : "";
  const email = label.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu)?.[0];

  if (!email) {
    return null;
  }

  return {
    email,
    ...(imageUrl ? { avatarUrl: imageUrl } : {})
  };
}

export function parseGmailPageContext(rawContext: unknown): GmailPageContext | null {
  if (!rawContext || typeof rawContext !== "object") {
    return null;
  }

  const context = rawContext as Record<string, unknown>;
  const title = readContextString(context.title);
  const url = readContextString(context.url);
  const subject = readContextString(context.subject);
  const sender = readContextString(context.sender);
  const body = normalizeGmailBody(readContextString(context.body));

  if (!title && !url && !subject && !sender && !body) {
    return null;
  }

  return {
    title,
    url,
    ...(subject ? { subject } : {}),
    ...(sender ? { sender } : {}),
    ...(body ? { body } : {})
  };
}

function readContextString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeGmailBody(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 12000);
}

async function triggerGmailAction(
  webContents: WebContents,
  action: OutlookShortcutAction,
  originalKey: string | undefined,
  forwardEditingKey: (key: string | undefined) => void
): Promise<void> {
  if (webContents.isDestroyed()) {
    return;
  }

  if (action === "refresh") {
    webContents.reload();
    return;
  }

  const guard = (await webContents.executeJavaScript(createGmailShortcutGuardScript(action), true)) as unknown;
  if (isGmailActionStatus(guard, "editing")) {
    if (process.env.GMAIL_CLIENT_DEBUG_SHORTCUTS === "1") {
      console.error("[gmail-shortcut] forward editing key", JSON.stringify({ action, originalKey }));
    }
    forwardEditingKey(originalKey);
    return;
  }

  if (action === "archive" || action === "delete") {
    const result = (await runGmailActionScript(webContents, action, originalKey)) as unknown;

    if (action === "delete" && process.env.GMAIL_CLIENT_DEBUG_SHORTCUTS === "1") {
      console.error("[gmail-shortcut] delete result", JSON.stringify({ originalKey, result }));
    }

    if (isGmailActionTarget(result)) {
      webContents.focus();
      webContents.sendInputEvent({ type: "mouseMove", x: result.x, y: result.y });
      webContents.sendInputEvent({ type: "mouseDown", x: result.x, y: result.y, button: "left", clickCount: 1 });
      webContents.sendInputEvent({ type: "mouseUp", x: result.x, y: result.y, button: "left", clickCount: 1 });
      return;
    }

    if (isGmailActionStatus(result, "handled-editable") || webContents.isDestroyed()) {
      return;
    }

    if (action === "delete") {
      if (process.env.GMAIL_CLIENT_DEBUG_SHORTCUTS === "1") {
        console.error("[gmail-shortcut] delete fallback shift+3");
      }
      webContents.sendInputEvent({ type: "keyDown", keyCode: "3", modifiers: ["shift"] });
      webContents.sendInputEvent({ type: "keyUp", keyCode: "3", modifiers: ["shift"] });
      return;
    }

    const keyCode = getGmailShortcutKey(action);
    webContents.sendInputEvent({ type: "keyDown", keyCode });
    webContents.sendInputEvent({ type: "keyUp", keyCode });
    return;
  }

  const result = (await runGmailActionScript(webContents, action, originalKey)) as unknown;

  if (isGmailActionTarget(result)) {
    webContents.focus();
    webContents.sendInputEvent({ type: "mouseMove", x: result.x, y: result.y });
    webContents.sendInputEvent({ type: "mouseDown", x: result.x, y: result.y, button: "left", clickCount: 1 });
    webContents.sendInputEvent({ type: "mouseUp", x: result.x, y: result.y, button: "left", clickCount: 1 });
    return;
  }

  if (isGmailActionStatus(result, "handled-editable") || webContents.isDestroyed()) {
    return;
  }

  const keyCode = getGmailShortcutKey(action);
  webContents.sendInputEvent({ type: "keyDown", keyCode });
  webContents.sendInputEvent({ type: "keyUp", keyCode });
}

function runGmailActionScript(webContents: WebContents, action: OutlookShortcutAction, originalKey?: string): Promise<unknown> {
  return webContents.executeJavaScript(
    createGmailActionScript(
      action,
      originalKey ? { deleteKey: originalKey, inputKey: originalKey.length === 1 ? originalKey : "" } : {}
    ),
    true
  );
}

function isGmailActionTarget(result: unknown): result is { status: "target"; x: number; y: number } {
  return (
    Boolean(result) &&
    typeof result === "object" &&
    (result as { status?: unknown }).status === "target" &&
    typeof (result as { x?: unknown }).x === "number" &&
    typeof (result as { y?: unknown }).y === "number"
  );
}

function isGmailActionStatus(result: unknown, status: string): boolean {
  return Boolean(result) && typeof result === "object" && (result as { status?: unknown }).status === status;
}

function applyNavigationPolicy(event: Event, url: string, allowedPolicyBypassUrl: string | null): void {
  if (allowedPolicyBypassUrl && isAllowedStartUrl(url, allowedPolicyBypassUrl)) {
    debugNavigation("allow-bypass", url);
    return;
  }

  const decision = classifyNavigationUrl(url);
  debugNavigation(decision, url);

  if (decision === "internal") {
    return;
  }

  event.preventDefault();

  if (decision === "external") {
    void shell.openExternal(url);
  }
}

function createGmailPopupWindowOptions(profileId: string): BrowserWindowConstructorOptions {
  return {
    width: 980,
    height: 720,
    minWidth: 720,
    minHeight: 520,
    title: "Gmail",
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    webPreferences: {
      partition: getPartitionName(profileId),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  };
}

function protectGmailPopupWindow(
  childWindow: BrowserWindow,
  profileId: string,
  allowedPolicyBypassUrl: string | null
): void {
  childWindow.webContents.setUserAgent(getGoogleCompatibleUserAgent(childWindow.webContents.getUserAgent()));
  childWindow.webContents.on("will-navigate", (event, url) => {
    applyNavigationPolicy(event, url, allowedPolicyBypassUrl);
  });
  childWindow.webContents.on("will-redirect", (event, url, _isInPlace, isMainFrame) => {
    if (isMainFrame) {
      applyNavigationPolicy(event, url, allowedPolicyBypassUrl);
    }
  });
  childWindow.webContents.setWindowOpenHandler(({ url }) => {
    const disposition = getWindowOpenDisposition(url);
    debugNavigation(`popup-window-open:${disposition.action}`, url);

    if (disposition.action === "allow-popup") {
      return {
        action: "allow",
        overrideBrowserWindowOptions: createGmailPopupWindowOptions(profileId)
      };
    }

    if (disposition.action === "open-external") {
      void shell.openExternal(disposition.url);
    }

    return { action: "deny" };
  });
}

function isAllowedStartUrl(url: string, allowedStartUrl: string): boolean {
  try {
    return new URL(url).href === new URL(allowedStartUrl).href;
  } catch {
    return false;
  }
}

function getConfiguredStartUrl(): string {
  if (process.env.GMAIL_CLIENT_E2E === "1") {
    return process.env.GMAIL_CLIENT_START_URL ?? DEFAULT_GMAIL_URL;
  }

  return DEFAULT_GMAIL_URL;
}

function getAllowedPolicyBypassUrl(startUrl: string): string | null {
  return process.env.GMAIL_CLIENT_E2E === "1" ? startUrl : null;
}

function getGoogleCompatibleUserAgent(defaultUserAgent: string): string {
  const withoutElectron = defaultUserAgent.replace(/\sElectron\/\S+/u, "");

  if (withoutElectron !== defaultUserAgent && withoutElectron.includes("Chrome/")) {
    return withoutElectron;
  }

  return SAFARI_COMPATIBLE_USER_AGENT;
}

function getLiveWebContents(view: WebContentsView): WebContents | null {
  try {
    const webContents = view.webContents;
    return webContents.isDestroyed() ? null : webContents;
  } catch (error) {
    if (isDestroyedObjectError(error)) {
      return null;
    }

    throw error;
  }
}

function ignoreDestroyedObjectError(action: () => void): void {
  try {
    action();
  } catch (error) {
    if (!isDestroyedObjectError(error)) {
      throw error;
    }
  }
}

function isDestroyedObjectError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Object has been destroyed");
}

export function isIgnorableLoadError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("ERR_ABORTED");
}

function debugNavigation(decision: string, url: string): void {
  if (process.env.GMAIL_CLIENT_DEBUG_NAV === "1") {
    console.error(`[gmail-nav] ${decision} ${url}`);
  }
}
