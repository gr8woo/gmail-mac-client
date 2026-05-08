export type NavigationDecision = "internal" | "external";

const INTERNAL_HOSTS = new Set([
  "mail.google.com",
  "accounts.google.com",
  "myaccount.google.com",
  "oauthaccountmanager.googleapis.com",
  "ssl.gstatic.com",
  "www.gstatic.com"
]);

export function classifyNavigationUrl(rawUrl: string): NavigationDecision {
  try {
    const url = new URL(rawUrl);

    if (url.protocol !== "https:") {
      return "external";
    }

    return INTERNAL_HOSTS.has(url.hostname) ? "internal" : "external";
  } catch {
    return "external";
  }
}
