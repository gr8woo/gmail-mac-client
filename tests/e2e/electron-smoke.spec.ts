import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

test("creates a profile and shows the top profile dropdown", async () => {
  const fixtureUrl = pathToFileURL(join(process.cwd(), "tests/fixtures/gmail.html")).toString();
  const userDataDir = await realpath(await mkdtemp(join(tmpdir(), "gmail-mac-client-e2e-")));

  const app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      GMAIL_CLIENT_E2E: "1",
      GMAIL_CLIENT_START_URL: fixtureUrl
    }
  });

  try {
    const actualUserDataDir = await app.evaluate(({ app: electronApp }) =>
      electronApp.getPath("userData")
    );
    expect(actualUserDataDir).toBe(userDataDir);

    const window = await app.firstWindow();
    await expect(window.getByText("Create your first Gmail profile")).toBeVisible();

    await window.getByLabel("Profile name").fill("Work");
    await window.getByRole("button", { name: "Create profile" }).click();

    await expect(window.getByRole("combobox", { name: "Current profile" })).toHaveValue(/.+/);
  } finally {
    await app.close();
    await rm(userDataDir, { force: true, recursive: true });
  }
});
