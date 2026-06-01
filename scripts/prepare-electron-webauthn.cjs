const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { execFileSync } = require("node:child_process");

if (process.platform !== "darwin") {
  process.exit(0);
}

const projectRoot = join(__dirname, "..");
const electronApp = join(projectRoot, "node_modules", "electron", "dist", "Electron.app");
const entitlements = join(projectRoot, "build", "entitlements.mac.plist");
const codesignIdentity = process.env.SIMPLE_GMAIL_CLIENT_DEV_CODESIGN_IDENTITY?.trim();

if (!existsSync(electronApp)) {
  execFileSync("npx", ["install-electron"], {
    cwd: projectRoot,
    stdio: "inherit"
  });
}

if (!codesignIdentity) {
  console.warn(
    "Skipping Electron WebAuthn dev signing. Set SIMPLE_GMAIL_CLIENT_DEV_CODESIGN_IDENTITY to enable local passkey testing."
  );
  process.exit(0);
}

execFileSync(
  "codesign",
  ["--force", "--deep", "--sign", codesignIdentity, "--entitlements", entitlements, electronApp],
  {
    cwd: projectRoot,
    stdio: "inherit"
  }
);
