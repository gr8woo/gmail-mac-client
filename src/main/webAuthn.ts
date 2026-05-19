import type { App } from "electron";

export const WEB_AUTHN_KEYCHAIN_ACCESS_GROUP = "7AX2JZT3L8.com.gr8woo.simplegmailclient.webauthn";
const ENABLE_WEB_AUTHN_ENV = "SIMPLE_GMAIL_CLIENT_ENABLE_WEBAUTHN";
const WEB_AUTHN_KEYCHAIN_ACCESS_GROUP_ENV = "SIMPLE_GMAIL_CLIENT_WEBAUTHN_KEYCHAIN_ACCESS_GROUP";

export function getWebAuthnKeychainAccessGroup(env: NodeJS.ProcessEnv = process.env): string {
  const configuredGroup = env[WEB_AUTHN_KEYCHAIN_ACCESS_GROUP_ENV]?.trim();
  return configuredGroup || WEB_AUTHN_KEYCHAIN_ACCESS_GROUP;
}

export function shouldConfigureMacWebAuthn(
  app: Pick<App, "isPackaged">,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return app.isPackaged || env[ENABLE_WEB_AUTHN_ENV] === "1";
}

export function configureMacWebAuthn(
  app: Pick<App, "configureWebAuthn" | "isPackaged">,
  platform = process.platform
): boolean {
  if (platform !== "darwin") {
    return false;
  }

  if (!shouldConfigureMacWebAuthn(app)) {
    return false;
  }

  try {
    app.configureWebAuthn({
      touchID: {
        keychainAccessGroup: getWebAuthnKeychainAccessGroup(),
        promptReason: "sign in to $1"
      }
    });
    return true;
  } catch (error) {
    console.warn("Failed to configure macOS WebAuthn platform authenticator.", error);
    return false;
  }
}
