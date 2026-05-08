export type NavigationDecision = "internal" | "external" | "blocked";

const INTERNAL_HOSTS = new Set([
  "mail.google.com",
  "accounts.google.com",
  "accounts.google.co.kr",
  "accounts.youtube.com",
  "login.microsoftonline.com",
  "myaccount.google.com",
  "oauthaccountmanager.googleapis.com"
]);

export function classifyNavigationUrl(rawUrl: string): NavigationDecision {
  try {
    const url = new URL(rawUrl);

    if (url.protocol === "https:" && isInternalHttpsUrl(url)) {
      return "internal";
    }

    if (url.protocol === "https:" || url.protocol === "http:") {
      return "external";
    }

    return "blocked";
  } catch {
    return "blocked";
  }
}

function isInternalHttpsUrl(url: URL): boolean {
  if (INTERNAL_HOSTS.has(url.hostname)) {
    return true;
  }

  return url.hostname === "www.google.com" && /^\/a\/[^/]+\/acs$/u.test(url.pathname);
}
