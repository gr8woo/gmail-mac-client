import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveGoogleSurface, GmailProfile, ProfileState } from "../../src/shared/profile";

const electronMock = vi.hoisted(() => ({
  shellOpenExternal: vi.fn(),
  views: [] as Array<{
    options: unknown;
    setBounds: ReturnType<typeof vi.fn>;
    webContents: {
      close: ReturnType<typeof vi.fn>;
      executeJavaScript: ReturnType<typeof vi.fn>;
      focus: ReturnType<typeof vi.fn>;
      getURL: ReturnType<typeof vi.fn>;
      getUserAgent: ReturnType<typeof vi.fn>;
      isDestroyed: ReturnType<typeof vi.fn>;
      loadURL: ReturnType<typeof vi.fn>;
      on: ReturnType<typeof vi.fn>;
      reload: ReturnType<typeof vi.fn>;
      sendInputEvent: ReturnType<typeof vi.fn>;
      setUserAgent: ReturnType<typeof vi.fn>;
      setWindowOpenHandler: ReturnType<typeof vi.fn>;
      url: string;
    };
  }>
}));

vi.mock("electron", () => {
  class MockWebContents {
    url = "";
    destroyed = false;
    close = vi.fn(() => {
      this.destroyed = true;
    });
    executeJavaScript = vi.fn(async () => ({ status: "ready" }));
    focus = vi.fn();
    getURL = vi.fn(() => this.url);
    getUserAgent = vi.fn(() => "Mozilla/5.0 Chrome/134.0.0.0 Electron/35.0.0");
    isDestroyed = vi.fn(() => this.destroyed);
    loadURL = vi.fn(async (url: string) => {
      this.url = url;
    });
    on = vi.fn();
    reload = vi.fn();
    sendInputEvent = vi.fn();
    setUserAgent = vi.fn();
    setWindowOpenHandler = vi.fn();
  }

  class MockWebContentsView {
    options: unknown;
    setBounds = vi.fn();
    webContents = new MockWebContents();

    constructor(options: unknown) {
      this.options = options;
      electronMock.views.push(this);
    }
  }

  return {
    BrowserWindow: class MockBrowserWindow {},
    WebContentsView: MockWebContentsView,
    shell: {
      openExternal: electronMock.shellOpenExternal
    }
  };
});

import {
  GmailViewController,
  getGoogleAppStartUrl,
  getProfileSwitchAction,
  getGmailBounds,
  getPrimaryGoogleAppRecoveryUrl,
  getPrimaryGmailRecoveryUrl,
  getSurfaceCacheKey,
  getWindowOpenDisposition,
  isIgnorableLoadError,
  parseGmailPageContext,
  parseGoogleAccountMetadata
} from "../../src/main/gmailViewController";

const CUSTOM_MAIL_URL = "https://mail.google.com/mail/u/0/#custom";
const CALENDAR_URL = "https://calendar.google.com/calendar/u/0/r";

beforeEach(() => {
  electronMock.shellOpenExternal.mockReset();
  electronMock.views.length = 0;
});

describe("GmailViewController", () => {
  it("loads configured Mail start URL and Calendar start URL for new surfaces", async () => {
    const { controller } = createController();

    await controller.switchToSurface({ profileId: "work", appKind: "mail" });
    await controller.switchToSurface({ profileId: "work", appKind: "calendar" });

    expect(electronMock.views[0]?.webContents.loadURL).toHaveBeenCalledWith(CUSTOM_MAIL_URL);
    expect(electronMock.views[1]?.webContents.loadURL).toHaveBeenCalledWith(CALENDAR_URL);
  });

  it("rejects switching to Calendar when the profile has Calendar disabled", async () => {
    const { controller } = createController({
      profiles: [createProfile({ id: "work", calendarEnabled: false })]
    });

    await expect(controller.switchToSurface({ profileId: "work", appKind: "calendar" })).rejects.toThrow(
      "Calendar is not enabled for profile: work"
    );
    expect(electronMock.views).toHaveLength(0);
  });

  it("activates a cached surface without reloading it", async () => {
    const { controller } = createController();

    await controller.switchToSurface({ profileId: "work", appKind: "mail" });
    const mailWebContents = electronMock.views[0]?.webContents;
    await controller.switchToSurface({ profileId: "work", appKind: "calendar" });
    await controller.switchToSurface({ profileId: "work", appKind: "mail" });

    expect(electronMock.views).toHaveLength(2);
    expect(mailWebContents?.loadURL).toHaveBeenCalledTimes(1);
  });

  it("closes Mail and Calendar cached views for a profile", async () => {
    const { controller } = createController();

    await controller.switchToSurface({ profileId: "work", appKind: "mail" });
    await controller.switchToSurface({ profileId: "work", appKind: "calendar" });

    controller.closeProfileView("work");

    expect(electronMock.views[0]?.webContents.close).toHaveBeenCalledTimes(1);
    expect(electronMock.views[1]?.webContents.close).toHaveBeenCalledTimes(1);
  });

  it("recovers Mail refresh to the configured start URL and Calendar refresh to Calendar", async () => {
    const { controller } = createController();

    await controller.switchToSurface({ profileId: "work", appKind: "mail" });
    const mailWebContents = electronMock.views[0]?.webContents;
    mailWebContents!.url = "about:blank";
    controller.refreshCurrentView();

    await controller.switchToSurface({ profileId: "work", appKind: "calendar" });
    const calendarWebContents = electronMock.views[1]?.webContents;
    calendarWebContents!.url = "about:blank";
    controller.refreshCurrentView();

    expect(mailWebContents?.loadURL).toHaveBeenLastCalledWith(CUSTOM_MAIL_URL);
    expect(calendarWebContents?.loadURL).toHaveBeenLastCalledWith(CALENDAR_URL);
  });

  it("does not intercept Gmail shortcuts while Calendar is active", async () => {
    const { controller } = createController();
    const event = { preventDefault: vi.fn() };

    await controller.switchToSurface({ profileId: "work", appKind: "calendar" });

    expect(controller.handleShortcutInput(event as never, { type: "keyDown", key: "Backspace" } as never)).toBe(
      false
    );
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(electronMock.views[0]?.webContents.executeJavaScript).not.toHaveBeenCalled();
  });

  it("lets the archive letter pass through without async replay", async () => {
    const { controller } = createController();
    const event = { preventDefault: vi.fn() };

    await controller.switchToSurface({ profileId: "work", appKind: "mail" });
    const mailWebContents = electronMock.views[0]!.webContents;

    expect(controller.handleShortcutInput(event as never, { type: "keyDown", key: "e" } as never)).toBe(false);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mailWebContents.executeJavaScript).not.toHaveBeenCalled();
    expect(mailWebContents.sendInputEvent).not.toHaveBeenCalled();
  });

  it("lets delete keys pass through without async replay", async () => {
    const { controller } = createController();
    const event = { preventDefault: vi.fn() };

    await controller.switchToSurface({ profileId: "work", appKind: "mail" });
    const mailWebContents = electronMock.views[0]!.webContents;

    expect(controller.handleShortcutInput(event as never, { type: "keyDown", key: "Backspace" } as never)).toBe(false);
    expect(controller.handleShortcutInput(event as never, { type: "keyDown", key: "Delete" } as never)).toBe(false);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mailWebContents.executeJavaScript).not.toHaveBeenCalled();
    expect(mailWebContents.sendInputEvent).not.toHaveBeenCalled();
  });

  it("does not replay modified shortcuts as plain text inside Gmail editors", async () => {
    const { controller } = createController();
    const event = { preventDefault: vi.fn() };

    await controller.switchToSurface({ profileId: "work", appKind: "mail" });
    const mailWebContents = electronMock.views[0]!.webContents;
    mailWebContents.executeJavaScript.mockResolvedValue({ status: "editing" });

    expect(controller.handleShortcutInput(event as never, { type: "keyDown", key: "r", control: true } as never)).toBe(
      true
    );
    await vi.waitFor(() => {
      expect(mailWebContents.executeJavaScript).toHaveBeenCalledTimes(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(mailWebContents.sendInputEvent).not.toHaveBeenCalled();
  });

  it("stores a defensive copy of the active surface", async () => {
    const { controller } = createController();
    const surface: ActiveGoogleSurface = { profileId: "work", appKind: "mail" };

    await controller.switchToSurface(surface);
    surface.appKind = "calendar";

    const mailWebContents = electronMock.views[0]?.webContents;
    mailWebContents!.url = "about:blank";
    controller.refreshCurrentView();

    expect(mailWebContents?.loadURL).toHaveBeenLastCalledWith(CUSTOM_MAIL_URL);
  });
});

describe("getProfileSwitchAction", () => {
  it("uses independent cache keys for mail and calendar", () => {
    expect(getSurfaceCacheKey({ profileId: "work", appKind: "mail" })).toBe("work:mail");
    expect(getSurfaceCacheKey({ profileId: "work", appKind: "calendar" })).toBe("work:calendar");
  });

  it("creates a new view when a profile has mail cached but not calendar cached", () => {
    expect(getProfileSwitchAction(new Set(["work:mail"]), { profileId: "work", appKind: "calendar" })).toBe(
      "create-and-load"
    );
  });

  it("reuses a cached profile view instead of reloading the login flow", () => {
    expect(getProfileSwitchAction(new Set(["work:mail", "personal:mail"]), { profileId: "work", appKind: "mail" })).toBe(
      "activate-cached"
    );
  });

  it("creates and loads a view for a profile that has not been opened yet", () => {
    expect(getProfileSwitchAction(new Set(["work:mail"]), { profileId: "personal", appKind: "mail" })).toBe(
      "create-and-load"
    );
  });
});

describe("getWindowOpenDisposition", () => {
  it("loads internal auth popups in the Gmail view", () => {
    expect(getWindowOpenDisposition("https://login.microsoftonline.com/example/saml2")).toEqual({
      action: "load-in-view",
      url: "https://login.microsoftonline.com/example/saml2"
    });
  });

  it("allows Gmail mail popups without replacing the primary Gmail view", () => {
    expect(
      getWindowOpenDisposition("https://mail.google.com/mail/u/0/?ui=2&ik=abcd&view=pt&search=inbox&th=123")
    ).toEqual({
      action: "allow-popup",
      url: "https://mail.google.com/mail/u/0/?ui=2&ik=abcd&view=pt&search=inbox&th=123"
    });
  });

  it("allows blank Gmail popup bootstraps without triggering Chromium popup blocking", () => {
    expect(getWindowOpenDisposition("about:blank")).toEqual({
      action: "allow-popup",
      url: "about:blank"
    });
  });

  it("opens external web popups outside the app", () => {
    expect(getWindowOpenDisposition("https://example.com/help")).toEqual({
      action: "open-external",
      url: "https://example.com/help"
    });
  });

  it("denies unsafe popup URLs", () => {
    expect(getWindowOpenDisposition("javascript:alert('xss')")).toEqual({
      action: "deny"
    });
  });
});

describe("getGmailBounds", () => {
  it("places Gmail below the active app chrome height", () => {
    expect(getGmailBounds({ x: 0, y: 0, width: 1280, height: 860 }, 320)).toEqual({
      x: 0,
      y: 320,
      width: 1280,
      height: 540
    });
  });

  it("does not return a negative Gmail height", () => {
    expect(getGmailBounds({ x: 0, y: 0, width: 1280, height: 100 }, 320)).toEqual({
      x: 0,
      y: 320,
      width: 1280,
      height: 0
    });
  });

  it("reserves horizontal space for the agent panel", () => {
    expect(getGmailBounds({ x: 0, y: 0, width: 1280, height: 860 }, 44, 360)).toEqual({
      x: 0,
      y: 44,
      width: 920,
      height: 816
    });
  });
});

describe("getPrimaryGmailRecoveryUrl", () => {
  it("returns start URLs for mail and calendar", () => {
    expect(getGoogleAppStartUrl("mail")).toContain("mail.google.com");
    expect(getGoogleAppStartUrl("calendar")).toBe("https://calendar.google.com/calendar/u/0/r");
  });

  it("recovers Calendar popup bootstrap pages to Calendar start URL", () => {
    expect(getPrimaryGoogleAppRecoveryUrl("about:blank", "calendar")).toBe(
      "https://calendar.google.com/calendar/u/0/r"
    );
  });

  it("recovers the primary Gmail view when it has been replaced by a blank popup page", () => {
    expect(getPrimaryGmailRecoveryUrl("about:blank", "https://mail.google.com/mail/u/0/#inbox")).toBe(
      "https://mail.google.com/mail/u/0/#inbox"
    );
  });

  it("keeps a normal Gmail page in place", () => {
    expect(
      getPrimaryGmailRecoveryUrl(
        "https://mail.google.com/mail/u/0/#inbox/FMfcgz",
        "https://mail.google.com/mail/u/0/#inbox"
      )
    ).toBeNull();
  });
});

describe("parseGoogleAccountMetadata", () => {
  it("extracts the signed-in Gmail account email and avatar URL", () => {
    expect(
      parseGoogleAccountMetadata({
        label: "Google 계정: Example User (work.user@example.com)",
        imageUrl: "https://lh3.googleusercontent.com/a/work-avatar=s96-c"
      })
    ).toEqual({
      email: "work.user@example.com",
      avatarUrl: "https://lh3.googleusercontent.com/a/work-avatar=s96-c"
    });
  });

  it("returns null when the Gmail page has not exposed account metadata yet", () => {
    expect(parseGoogleAccountMetadata({ label: "Google apps", imageUrl: "" })).toBeNull();
  });
});

describe("parseGmailPageContext", () => {
  it("normalizes the current open Gmail message context", () => {
    expect(
      parseGmailPageContext({
        title: "분기 리뷰 - Gmail",
        url: "https://mail.google.com/mail/u/0/#inbox/FMfcgz",
        subject: "분기 리뷰",
        sender: "boss@example.com",
        body: "  첫 줄\n\n\n둘째 줄  "
      })
    ).toEqual({
      title: "분기 리뷰 - Gmail",
      url: "https://mail.google.com/mail/u/0/#inbox/FMfcgz",
      subject: "분기 리뷰",
      sender: "boss@example.com",
      body: "첫 줄\n\n둘째 줄"
    });
  });
});

describe("isIgnorableLoadError", () => {
  it("ignores navigation aborts from auth redirect races", () => {
    expect(isIgnorableLoadError(new Error("ERR_ABORTED (-3) loading 'https://accounts.google.com'"))).toBe(true);
  });

  it("does not ignore unrelated load errors", () => {
    expect(isIgnorableLoadError(new Error("ERR_CERT_AUTHORITY_INVALID"))).toBe(false);
  });
});

function createController(options: { profiles?: GmailProfile[]; startUrl?: string } = {}): {
  controller: GmailViewController;
} {
  const profiles = options.profiles ?? [createProfile({ id: "work", calendarEnabled: true })];
  const store = {
    getState: (): ProfileState => ({
      profiles,
      lastActiveProfileId: profiles[0]?.id ?? null,
      lastActiveSurface: null
    })
  };
  const window = {
    contentView: {
      addChildView: vi.fn(),
      removeChildView: vi.fn()
    },
    getContentBounds: vi.fn(() => ({ x: 0, y: 0, width: 1280, height: 860 })),
    isDestroyed: vi.fn(() => false),
    off: vi.fn(),
    on: vi.fn(),
    once: vi.fn()
  };

  return {
    controller: new GmailViewController(window as never, store as never, {
      startUrl: options.startUrl ?? CUSTOM_MAIL_URL
    })
  };
}

function createProfile(options: { id: string; calendarEnabled: boolean }): GmailProfile {
  return {
    id: options.id,
    displayName: options.id,
    partition: `persist:gmail-profile-${options.id}`,
    calendarEnabled: options.calendarEnabled,
    createdAt: "2026-05-19T00:00:00.000Z",
    updatedAt: "2026-05-19T00:00:00.000Z"
  };
}
