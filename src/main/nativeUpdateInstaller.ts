/** Squirrel emits a later native verification result after electron-updater downloads.
 * Own these listeners so a failed attempt cannot restart the app on a late event. */
export interface NativeUpdaterPort {
  once(event: string, listener: (...args: any[]) => void): unknown;
  removeListener(event: string, listener: (...args: any[]) => void): unknown;
  checkForUpdates(): void;
  quitAndInstall(): void;
}
export function stageVerifiedNativeInstall(native: NativeUpdaterPort): void {
  let finished = false;
  const cleanup = () => {
    native.removeListener("update-downloaded", ready);
    native.removeListener("error", failed);
  };
  const failed = () => { finished = true; cleanup(); };
  const ready = () => {
    if (finished) return;
    finished = true;
    cleanup();
    native.quitAndInstall();
  };
  native.once("update-downloaded", ready);
  native.once("error", failed);
  try { native.checkForUpdates(); } catch (error) { failed(); throw error; }
}
