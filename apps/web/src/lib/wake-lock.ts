"use client";

import { useEffect } from "react";

/** Keeps the screen on while `active` (Screen Wake Lock, where supported): a ticket on show, a
 * live board on a TV. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) {
      return;
    }
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const request = async () => {
      if (document.visibilityState !== "visible" || released) {
        return;
      }
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        // Battery saver or no permission: the screen just follows the phone's settings.
      }
    };
    void request();
    const onVisible = () => {
      void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
}
