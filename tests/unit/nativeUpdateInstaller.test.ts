import { EventEmitter } from "node:events";
import { describe, it, vi, expect } from "vitest";
import { stageVerifiedNativeInstall } from "../../src/main/nativeUpdateInstaller";
function fixture() {
  const native = Object.assign(new EventEmitter(), { checkForUpdates: vi.fn(), quitAndInstall: vi.fn() });
  native.on("error", () => undefined); // electron-updater forwards this event to UI
  return native;
}
describe("native install verification", () => {
  it("waits for native verification before restart", () => {
    const native = fixture(); stageVerifiedNativeInstall(native);
    expect(native.quitAndInstall).not.toHaveBeenCalled();
    native.emit("update-downloaded"); native.emit("update-downloaded");
    expect(native.quitAndInstall).toHaveBeenCalledTimes(1);
  });
  it("removes the restart callback on errors, including a late success event", () => {
    const native = fixture(); stageVerifiedNativeInstall(native);
    native.emit("error", new Error("invalid signature"));
    native.emit("update-downloaded");
    expect(native.quitAndInstall).not.toHaveBeenCalled();
    expect(native.listenerCount("update-downloaded")).toBe(0);
  });
  it("cleans up synchronous failures", () => {
    const native = fixture(); native.checkForUpdates.mockImplementation(() => { throw new Error("not ready"); });
    expect(() => stageVerifiedNativeInstall(native)).toThrow("not ready");
    native.emit("update-downloaded"); expect(native.quitAndInstall).not.toHaveBeenCalled();
  });
});
