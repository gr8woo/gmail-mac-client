import { describe, expect, it } from "vitest";
import {
  getProfileSwitchAction,
  getWindowOpenDisposition,
  isIgnorableLoadError
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

describe("isIgnorableLoadError", () => {
  it("ignores navigation aborts from auth redirect races", () => {
    expect(isIgnorableLoadError(new Error("ERR_ABORTED (-3) loading 'https://accounts.google.com'"))).toBe(true);
  });

  it("does not ignore unrelated load errors", () => {
    expect(isIgnorableLoadError(new Error("ERR_CERT_AUTHORITY_INVALID"))).toBe(false);
  });
});
