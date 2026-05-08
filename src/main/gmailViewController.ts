import { BrowserWindow, WebContentsView, shell } from "electron";
import type { Event, Rectangle, WebContents } from "electron";
import { getPartitionName } from "../shared/profile";
import { classifyNavigationUrl } from "../shared/urlPolicy";
import type { FileProfileStore } from "./profileStore";

const APP_BAR_HEIGHT = 44;
const DEFAULT_GMAIL_URL = "https://mail.google.com";

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
    private readonly startUrl = process.env.GMAIL_CLIENT_START_URL ?? DEFAULT_GMAIL_URL
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

    view.webContents.setWindowOpenHandler(({ url }) => {
      const decision = classifyNavigationUrl(url);

      if (decision === "external") {
        void shell.openExternal(url);
      }

      return { action: "deny" };
    });

    view.webContents.on("will-navigate", (event, url) => {
      applyNavigationPolicy(event, url, this.startUrl);
    });

    view.webContents.on("will-redirect", (event, url) => {
      applyNavigationPolicy(event, url, this.startUrl);
    });

    this.currentView = view;
    this.window.contentView.addChildView(view);
    this.layout();

    try {
      await view.webContents.loadURL(this.startUrl);
    } catch (error) {
      if (token === this.switchToken && !view.webContents.isDestroyed()) {
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

function applyNavigationPolicy(event: Event, url: string, allowedStartUrl: string): void {
  if (isAllowedStartUrl(url, allowedStartUrl)) {
    return;
  }

  const decision = classifyNavigationUrl(url);

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
