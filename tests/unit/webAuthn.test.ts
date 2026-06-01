import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureMacWebAuthn,
  getWebAuthnKeychainAccessGroup,
  shouldConfigureMacWebAuthn,
  WEB_AUTHN_KEYCHAIN_ACCESS_GROUP
} from "../../src/main/webAuthn";

const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

beforeEach(() => {
  consoleWarnSpy.mockClear();
});

describe("configureMacWebAuthn", () => {
  it("configures Touch ID WebAuthn on macOS when explicitly enabled", () => {
    const configureWebAuthn = vi.fn();

    const didConfigure = configureMacWebAuthn({ configureWebAuthn, isPackaged: true }, "darwin", {
      SIMPLE_GMAIL_CLIENT_ENABLE_WEBAUTHN: "1"
    });

    expect(didConfigure).toBe(true);
    expect(configureWebAuthn).toHaveBeenCalledWith({
      touchID: {
        keychainAccessGroup: WEB_AUTHN_KEYCHAIN_ACCESS_GROUP,
        promptReason: "sign in to $1"
      }
    });
  });

  it("does not configure WebAuthn on other platforms", () => {
    const configureWebAuthn = vi.fn();

    const didConfigure = configureMacWebAuthn({ configureWebAuthn, isPackaged: true }, "win32");

    expect(didConfigure).toBe(false);
    expect(configureWebAuthn).not.toHaveBeenCalled();
  });

  it("does not configure WebAuthn unless explicitly enabled", () => {
    const configureWebAuthn = vi.fn();

    const didConfigure = configureMacWebAuthn({ configureWebAuthn, isPackaged: true }, "darwin");

    expect(didConfigure).toBe(false);
    expect(configureWebAuthn).not.toHaveBeenCalled();
  });

  it("keeps the app running if WebAuthn configuration fails", () => {
    const error = new Error("missing entitlement");
    const configureWebAuthn = vi.fn(() => {
      throw error;
    });

    const didConfigure = configureMacWebAuthn({ configureWebAuthn, isPackaged: true }, "darwin", {
      SIMPLE_GMAIL_CLIENT_ENABLE_WEBAUTHN: "1"
    });

    expect(didConfigure).toBe(false);
    expect(consoleWarnSpy).toHaveBeenCalledWith("Failed to configure macOS WebAuthn platform authenticator.", error);
  });
});

describe("shouldConfigureMacWebAuthn", () => {
  it("does not configure in packaged builds by default", () => {
    expect(shouldConfigureMacWebAuthn({ isPackaged: true }, {})).toBe(false);
  });

  it("configures in development only when explicitly enabled", () => {
    expect(shouldConfigureMacWebAuthn({ isPackaged: false }, {})).toBe(false);
    expect(shouldConfigureMacWebAuthn({ isPackaged: false }, { SIMPLE_GMAIL_CLIENT_ENABLE_WEBAUTHN: "1" })).toBe(
      true
    );
  });
});

describe("getWebAuthnKeychainAccessGroup", () => {
  it("uses the configured keychain access group when provided", () => {
    expect(
      getWebAuthnKeychainAccessGroup({
        SIMPLE_GMAIL_CLIENT_WEBAUTHN_KEYCHAIN_ACCESS_GROUP: "TEAMID.com.example.app.webauthn"
      })
    ).toBe("TEAMID.com.example.app.webauthn");
  });

  it("falls back to the bundled app keychain access group", () => {
    expect(getWebAuthnKeychainAccessGroup({})).toBe(WEB_AUTHN_KEYCHAIN_ACCESS_GROUP);
  });
});
