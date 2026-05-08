import { BrowserWindow, WebContentsView, shell } from "electron";
import type { Event, Rectangle, WebContents } from "electron";
import { getPartitionName } from "../shared/profile";
import { classifyNavigationUrl } from "../shared/urlPolicy";
import type { FileProfileStore } from "./profileStore";

const APP_BAR_HEIGHT = 44;
const DEFAULT_GMAIL_URL =
  "https://accounts.google.com/v3/signin/identifier?service=mail&continue=https%3A%2F%2Fmail.google.com%2Fmail%2Fu%2F0%2F&followup=https%3A%2F%2Fmail.google.com%2Fmail%2Fu%2F0%2F&flowName=GlifWebSignIn&flowEntry=ServiceLogin";
const SAFARI_COMPATIBLE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
type WindowOpenDisposition =
  | { action: "load-in-view"; url: string }
  | { action: "open-external"; url: string }
  | { action: "deny" };
type ProfileSwitchAction = "activate-cached" | "create-and-load";

export class GmailViewController {
  private currentView: WebContentsView | null = null;
  private currentProfileId: string | null = null;
  private readonly profileViews = new Map<string, WebContentsView>();
  private switchToken = 0;
  private readonly layoutCurrentView = () => this.layout();
  private readonly closeCurrentViewWhenWindowCloses = () => {
    this.window.off("resize", this.layoutCurrentView);
    this.closeAllProfileViews();
  };

  constructor(
    private readonly window: BrowserWindow,
    private readonly store: FileProfileStore,
    private readonly startUrl = getConfiguredStartUrl(),
    private readonly allowedPolicyBypassUrl = getAllowedPolicyBypassUrl(startUrl)
  ) {}

  attach(): void {
    this.window.on("resize", this.layoutCurrentView);
    this.window.once("closed", this.closeCurrentViewWhenWindowCloses);
  }

  async switchToProfile(profileId: string): Promise<void> {
    const profile = this.store.getState().profiles.find((candidate) => candidate.id === profileId);

    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const token = ++this.switchToken;
    if (this.currentProfileId === profile.id && this.currentView) {
      this.layout();
      return;
    }

    this.detachCurrentView();

    const switchAction = getProfileSwitchAction(new Set(this.profileViews.keys()), profile.id);
    const view =
      switchAction === "activate-cached" ? this.profileViews.get(profile.id) : this.createProfileView(profile.id);

    if (!view) {
      throw new Error(`Profile view not found: ${profile.id}`);
    }

    this.currentProfileId = profile.id;
    this.currentView = view;
    this.window.contentView.addChildView(view);
    this.layout();

    if (switchAction === "activate-cached") {
      return;
    }

    try {
      await view.webContents.loadURL(this.startUrl);
    } catch (error) {
      if (isIgnorableLoadError(error)) {
        return;
      }

      if (token === this.switchToken && getLiveWebContents(view)) {
        throw error;
      }
    }
  }

  private createProfileView(profileId: string): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        partition: getPartitionName(profileId),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });

    view.webContents.setUserAgent(getGoogleCompatibleUserAgent(view.webContents.getUserAgent()));

    view.webContents.setWindowOpenHandler(({ url }) => {
      const disposition = getWindowOpenDisposition(url);
      debugNavigation(`window-open:${disposition.action}`, url);

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

    view.webContents.on("will-navigate", (event, url) => {
      applyNavigationPolicy(event, url, this.allowedPolicyBypassUrl);
    });

    view.webContents.on("did-navigate", (_event, url) => {
      debugNavigation("did-navigate", url);
    });

    view.webContents.on("did-navigate-in-page", (_event, url) => {
      debugNavigation("did-navigate-in-page", url);
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

    this.profileViews.set(profileId, view);
    return view;
  }

  layout(): void {
    if (!this.currentView) {
      return;
    }

    this.currentView.setBounds(getGmailBounds(this.window.getContentBounds()));
  }

  clearProfileView(): void {
    ++this.switchToken;
    this.closeAllProfileViews();
  }

  closeProfileView(profileId: string): void {
    ++this.switchToken;
    this.closeProfileViewById(profileId);
  }

  private detachCurrentView(): void {
    if (!this.currentView) {
      return;
    }

    const view = this.currentView;
    this.currentView = null;
    this.currentProfileId = null;

    if (!this.window.isDestroyed()) {
      ignoreDestroyedObjectError(() => {
        this.window.contentView.removeChildView(view);
      });
    }
  }

  private closeProfileViewById(profileId: string): void {
    const view = this.profileViews.get(profileId);

    if (!view) {
      return;
    }

    if (this.currentProfileId === profileId) {
      this.detachCurrentView();
    }

    this.profileViews.delete(profileId);

    const webContents = getLiveWebContents(view);
    if (webContents) {
      ignoreDestroyedObjectError(() => {
        webContents.close();
      });
    }
  }

  private closeAllProfileViews(): void {
    const profileIds = [...this.profileViews.keys()];

    for (const profileId of profileIds) {
      this.closeProfileViewById(profileId);
    }

    this.currentView = null;
    this.currentProfileId = null;
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

export function getProfileSwitchAction(cachedProfileIds: ReadonlySet<string>, profileId: string): ProfileSwitchAction {
  return cachedProfileIds.has(profileId) ? "activate-cached" : "create-and-load";
}

export function getWindowOpenDisposition(rawUrl: string): WindowOpenDisposition {
  const decision = classifyNavigationUrl(rawUrl);

  if (decision === "internal") {
    return { action: "load-in-view", url: rawUrl };
  }

  if (decision === "external") {
    return { action: "open-external", url: rawUrl };
  }

  return { action: "deny" };
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
