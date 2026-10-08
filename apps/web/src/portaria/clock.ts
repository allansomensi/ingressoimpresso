/** A once-per-second clock for "synced 5 s ago" labels, readable with `useSyncExternalStore`. */
let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

export function subscribeClock(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === undefined) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const item of listeners) {
        item();
      }
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function clockNow(): number {
  return now;
}

export function serverClockNow(): number {
  return 0;
}
