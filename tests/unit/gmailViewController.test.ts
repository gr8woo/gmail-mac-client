import { describe, expect, it } from "vitest";
import {
  getGoogleAppStartUrl,
  getProfileSwitchAction,
  getGmailBounds,
  getPrimaryGoogleAppRecoveryUrl,
  getPrimaryGmailRecoveryUrl,
  getWindowOpenDisposition,
  isIgnorableLoadError,
  parseGmailPageContext,
  parseGoogleAccountMetadata
} from "../../src/main/gmailViewController";

describe("getProfileSwitchAction", () => {
  it("reuses a cached profile view instead of reloading the login flow", () => {
    expect(getProfileSwitchAction(new Set(["work", "personal"]), "work")).toBe("activate-cached");
  });

  it("creates and loads a view for a profile that has not been opened yet", () => {
    expect(getProfileSwitchAction(new Set(["work"]), "personal")).toBe("create-and-load");
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
        label: "Google 계정: Glen Lee (gr8woo@zigbang.com)",
        imageUrl: "https://lh3.googleusercontent.com/a/work-avatar=s96-c"
      })
    ).toEqual({
      email: "gr8woo@zigbang.com",
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
