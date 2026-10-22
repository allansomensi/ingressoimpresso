import type { KeyboardEvent } from "react";

/**
 * Keyboard rules of a segmented control made of buttons with `role="radio"` (or `role="tab"`):
 * one tab stop for the group (only the chosen option has `tabIndex` 0, see `segmentTabIndex`),
 * the arrows move the choice, Home and End jump to the ends, and the newly chosen option takes
 * the focus. Attach the result to the group's `onKeyDown`.
 */
export function segmentedKeys<T>(options: readonly T[], selected: T, select: (value: T) => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    let next: T | undefined;
    if (step !== 0) {
      const index = Math.max(options.indexOf(selected), 0);
      next = options[(index + step + options.length) % options.length];
    } else if (event.key === "Home") {
      next = options[0];
    } else if (event.key === "End") {
      next = options.at(-1);
    }
    if (next === undefined || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    select(next);
    const buttons = event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"], [role="tab"]');
    buttons[options.indexOf(next)]?.focus();
  };
}

/** `tabIndex` of one option: only the chosen one is in the tab order (when none is, the first). */
export function segmentTabIndex<T>(options: readonly T[], selected: T, option: T): 0 | -1 {
  const chosen = options.includes(selected) ? selected : options[0];
  return option === chosen ? 0 : -1;
}
