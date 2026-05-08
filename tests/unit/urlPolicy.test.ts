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

  it("opens non-Gmail URLs externally", () => {
    expect(classifyNavigationUrl("https://example.com/article")).toBe("external");
  });

  it("opens invalid URLs externally", () => {
    expect(classifyNavigationUrl("not a url")).toBe("external");
  });
});
