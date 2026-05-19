import { describe, expect, it } from "vitest";
import { formatStatusMessage } from "../../src/renderer/components/StatusBar";

describe("formatStatusMessage", () => {
  it("keeps concise user-facing status messages", () => {
    expect(formatStatusMessage("Switch failed")).toBe("Switch failed");
  });

  it("hides leaked JavaScript source from the compact app bar", () => {
    expect(
      formatStatusMessage(
        "s = createResumableState( options ? options.identifierPrefix : void 0 ), request = createPrerenderRequest( children"
      )
    ).toBe("앱 상태를 업데이트하는 중 오류가 발생했습니다.");
  });
});
