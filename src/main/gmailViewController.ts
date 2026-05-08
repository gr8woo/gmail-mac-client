import { BrowserWindow, WebContentsView, shell } from "electron";
import type { Event, Rectangle } from "electron";
import { getPartitionName } from "../shared/profile";
import { classifyNavigationUrl } from "../shared/urlPolicy";
import type { FileProfileStore } from "./profileStore";

const APP_BAR_HEIGHT = 44;
const DEFAULT_GMAIL_URL = "https://mail.google.com";

export class GmailViewController {
  private currentView: WebContentsView | null = null;
  private switchToken = 0;

  constructor(
    private readonly window: BrowserWindow,
    private readonly store: FileProfileStore,
    private readonly startUrl = process.env.GMAIL_CLIENT_START_URL ?? DEFAULT_GMAIL_URL
  ) {}

  attach(): void {
    this.window.on("resize", () => this.layout());
    this.window.on("closed", () => this.closeCurrentView());
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
      applyNavigationPolicy(event, url);
    });

    view.webContents.on("will-redirect", (event, url) => {
      applyNavigationPolicy(event, url);
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

    this.window.contentView.removeChildView(this.currentView);
    this.currentView.webContents.close();
    this.currentView = null;
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

function applyNavigationPolicy(event: Event, url: string): void {
  const decision = classifyNavigationUrl(url);

  if (decision === "internal") {
    return;
  }

  event.preventDefault();

  if (decision === "external") {
    void shell.openExternal(url);
  }
}
