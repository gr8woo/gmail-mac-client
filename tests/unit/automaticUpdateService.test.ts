import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { AutomaticUpdateService, type UpdaterPort } from "../../src/main/automaticUpdateService";

function setup() {
  const emitter = new EventEmitter();
  const updater: UpdaterPort = Object.assign(emitter, {
    autoDownload: true, autoInstallOnAppQuit: true, allowDowngrade: true, allowPrerelease: true,
    checkForUpdates: vi.fn(async () => { emitter.emit("update-available", { version: "0.2.0" }); }),
    downloadUpdate: vi.fn(async () => undefined), quitAndInstall: vi.fn()
  });
  const deps = { updater, currentVersion: "0.1.6", ensureSupported: vi.fn(async () => undefined), hasActiveWork: vi.fn(() => false) };
  return { emitter, updater, deps, service: new AutomaticUpdateService(deps) };
}

describe("automatic updates", () => {
  it("checks without downloading and disallows prerelease/downgrade/quit installs", async () => {
    const { updater, service } = setup();
    expect(await service.check()).toMatchObject({ phase: "available", latestVersion: "0.2.0" });
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.allowDowngrade).toBe(false);
    expect(updater.allowPrerelease).toBe(false);
  });
  it("shares repeated check and install requests and restarts only once", async () => {
    const { updater, service } = setup();
    await Promise.all([service.check(), service.check()]);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    await Promise.all([service.updateAndRestart(), service.updateAndRestart()]);
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
    await service.updateAndRestart();
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
  it("does not access production feed for preview or unsupported builds", async () => {
    const { updater, deps, service } = setup();
    deps.ensureSupported.mockRejectedValue(new Error("Preview is not supported"));
    expect(await service.check()).toMatchObject({ phase: "error" });
    await service.updateAndRestart();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });
  it("does not restart after a failed download and permits a safe retry", async () => {
    const { updater, service } = setup();
    await service.check();
    vi.mocked(updater.downloadUpdate).mockRejectedValueOnce(new Error("checksum mismatch"));
    expect(await service.updateAndRestart()).toMatchObject({ phase: "error" });
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    await service.updateAndRestart();
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
  it("does not start download during AI work", async () => {
    const { updater, deps, service } = setup();
    await service.check();
    deps.hasActiveWork.mockReturnValue(true);
    expect(await service.updateAndRestart()).toMatchObject({ phase: "available" });
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });
  it("holds a completed download if new AI work started, then installs without redownloading", async () => {
    const { updater, deps, service } = setup();
    await service.check();
    vi.mocked(updater.downloadUpdate).mockImplementation(async () => { deps.hasActiveWork.mockReturnValue(true); });
    expect(await service.updateAndRestart()).toMatchObject({ phase: "ready" });
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    deps.hasActiveWork.mockReturnValue(false);
    await service.updateAndRestart();
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
  it("broadcasts progress, cleans listeners and surfaces native signature failures", async () => {
    const { emitter, service } = setup();
    const listener = vi.fn(); const unsubscribe = service.subscribe(listener);
    emitter.emit("download-progress", { percent: 52 });
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "downloading", percent: 52 }));
    emitter.emit("error", new Error("signature verification failed"));
    expect(service.getState()).toMatchObject({ phase: "error", message: expect.stringContaining("signature") });
    unsubscribe(); listener.mockClear();
    emitter.emit("update-not-available");
    expect(listener).not.toHaveBeenCalled();
  });
  it("does not install when there is no newer release", async () => {
    const { emitter, updater, service } = setup();
    vi.mocked(updater.checkForUpdates).mockImplementation(async () => { emitter.emit("update-not-available"); });
    await service.updateAndRestart();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });
});

it("requires restart after native install failure instead of stacking install listeners", async () => {
  const { updater, emitter, service } = setup();
  await service.check(); await service.updateAndRestart();
  emitter.emit("error", new Error("Squirrel signature mismatch"));
  expect(service.getState().message).toContain("다시 실행");
  await service.updateAndRestart();
  expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
});
