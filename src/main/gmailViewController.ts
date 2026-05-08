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

export class GmailViewController {
  private currentView: WebContentsView | null = null;
  private switchToken = 0;
  private readonly layoutCurrentView = () => this.layout();
  private readonly closeCurrentViewWhenWindowCloses = () => {
    this.window.off("resize", this.layoutCurrentView);
    this.closeCurrentView();
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
    this.closeCurrentView();

    const view = new WebContentsView({
      webPreferences: {
        partition: getPartitionName(profile.id),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });

    view.webContents.setUserAgent(getGoogleCompatibleUserAgent(view.webContents.getUserAgent()));

    view.webContents.setWindowOpenHandler(({ url }) => {
      const decision = classifyNavigationUrl(url);

      if (decision === "external") {
        void shell.openExternal(url);
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

    this.currentView = view;
    this.window.contentView.addChildView(view);
    this.layout();

    try {
      await view.webContents.loadURL(this.startUrl);
    } catch (error) {
      if (token === this.switchToken && getLiveWebContents(view)) {
        throw error;
      }
    }
  }

  layout(): void {
    if (!this.currentView) {
      return;
    }

    this.currentView.setBounds(getGmailBounds(this.window.getContentBounds()));
  }

  clearProfileView(): void {
    ++this.switchToken;
    this.closeCurrentView();
  }

  private closeCurrentView(): void {
    if (!this.currentView) {
      return;
    }

    const view = this.currentView;
    this.currentView = null;

    if (!this.window.isDestroyed()) {
      ignoreDestroyedObjectError(() => {
        this.window.contentView.removeChildView(view);
      });
    }

    const webContents = getLiveWebContents(view);
    if (webContents) {
      ignoreDestroyedObjectError(() => {
        webContents.close();
      });
    }
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

function debugNavigation(decision: string, url: string): void {
  if (process.env.GMAIL_CLIENT_DEBUG_NAV === "1") {
    console.error(`[gmail-nav] ${decision} ${url}`);
  }
}
