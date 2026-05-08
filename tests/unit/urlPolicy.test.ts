import { describe, expect, it } from "vitest";
import { classifyNavigationUrl } from "../../src/shared/urlPolicy";

describe("classifyNavigationUrl", () => {
  it("keeps Gmail URLs in the app", () => {
    expect(classifyNavigationUrl("https://mail.google.com/mail/u/0/#inbox")).toBe("internal");
  });

  it("keeps Google auth URLs in the app", () => {
    expect(classifyNavigationUrl("https://accounts.google.com/signin/v2/identifier")).toBe("internal");
  });

  it("keeps Google OAuth URLs in the app", () => {
    expect(classifyNavigationUrl("https://oauthaccountmanager.googleapis.com/v1/issuetoken")).toBe("internal");
  });

  it("keeps Google sign-in connection checks in the app", () => {
    expect(classifyNavigationUrl("https://accounts.youtube.com/accounts/CheckConnection")).toBe("internal");
  });

  it("keeps Microsoft SAML sign-in redirects in the app", () => {
    expect(classifyNavigationUrl("https://login.microsoftonline.com/example/saml2")).toBe("internal");
  });

  it("opens non-Gmail URLs externally", () => {
    expect(classifyNavigationUrl("https://example.com/article")).toBe("external");
  });

  it("opens http web URLs externally", () => {
    expect(classifyNavigationUrl("http://example.com/article")).toBe("external");
  });

  it("opens gstatic URLs externally", () => {
    expect(classifyNavigationUrl("https://ssl.gstatic.com/ui/v1/icons/mail/rfr/logo_gmail_lockup_default_1x_r5.png")).toBe(
      "external"
    );
    expect(classifyNavigationUrl("https://www.gstatic.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png")).toBe(
      "external"
    );
  });

  it("blocks invalid URLs", () => {
    expect(classifyNavigationUrl("not a url")).toBe("blocked");
  });

  it("blocks unsafe non-web schemes", () => {
    expect(classifyNavigationUrl("file:///Users/example/secrets.txt")).toBe("blocked");
    expect(classifyNavigationUrl("javascript:alert('xss')")).toBe("blocked");
    expect(classifyNavigationUrl("data:text/html,<script>alert('xss')</script>")).toBe("blocked");
    expect(classifyNavigationUrl("slack://channel?id=123")).toBe("blocked");
  });
});
