import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

test("creates a profile and shows the top profile button", async () => {
  const fixtureUrl = pathToFileURL(join(process.cwd(), "tests/fixtures/gmail.html")).toString();
  const userDataDir = await realpath(await mkdtemp(join(tmpdir(), "gmail-mac-client-e2e-")));
  let app: Awaited<ReturnType<typeof electron.launch>> | null = null;

  try {
    app = await electron.launch({
      args: [".", `--user-data-dir=${userDataDir}`],
      env: {
        ...process.env,
        GMAIL_CLIENT_E2E: "1",
        GMAIL_CLIENT_START_URL: fixtureUrl
      }
    });

    const actualUserDataDir = await app.evaluate(({ app: electronApp }) =>
      electronApp.getPath("userData")
    );
    expect(actualUserDataDir).toBe(userDataDir);

    const window = await app.firstWindow();
    await expect(window.getByText("Create your first Gmail profile")).toBeVisible();

    await window.getByLabel("Profile name").fill("Work");
    await window.getByRole("button", { name: "Create profile" }).click();

    await expect(window.getByRole("button", { name: "Switch to Work" })).toBeVisible();
    await window.getByRole("button", { name: "Settings" }).click();
    await window.getByRole("switch", { name: "Enable Calendar for Work" }).click();
    await window.getByRole("button", { name: "메일로 돌아가기" }).click();
    await expect(window.getByRole("button", { name: "Switch to Work Calendar" })).toBeVisible();

    await window.getByRole("button", { name: "AI assistant", exact: true }).click();
    await expect(window.getByRole("complementary", { name: "AI assistant" })).toBeVisible();
    await window.getByRole("button", { name: "AI assistant", exact: true }).click();
    await expect(window.getByRole("complementary", { name: "AI assistant" })).toBeHidden();
  } finally {
    await app?.close();
    await rm(userDataDir, { force: true, recursive: true });
  }
});
