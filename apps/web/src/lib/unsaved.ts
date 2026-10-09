/**
 * Unsaved changes of the page (the ticket editor): leaving asks first, inside the app (tab
 * switches, links) and when the tab or window is closed.
 */
import { useEffect } from "react";

let dirty = false;

/** Whether some editor on the page has unsaved changes. */
export function hasUnsavedChanges(): boolean {
  return dirty;
}

/** Marks the page as having unsaved changes while `active` is true. */
export function useUnsavedChanges(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return;
    }
    dirty = true;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      dirty = false;
      window.removeEventListener("beforeunload", warn);
    };
  }, [active]);
}
