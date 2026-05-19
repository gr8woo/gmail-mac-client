import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = join(__dirname, "../..");

describe("app icon assets", () => {
  it("configures a packaged macOS icon with a tracked source asset", () => {
    const builderConfig = readFileSync(join(projectRoot, "electron-builder.yml"), "utf8");

    expect(builderConfig).toContain("icon: build/icon.icns");
    expect(builderConfig).toContain("  - build/icon.png");
    expect(existsSync(join(projectRoot, "build/icon.icns"))).toBe(true);
    expect(existsSync(join(projectRoot, "build/icon.png"))).toBe(true);
    expect(existsSync(join(projectRoot, "build/icon.svg"))).toBe(true);
  });
});
