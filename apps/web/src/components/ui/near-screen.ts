"use client";

import { useEffect, useState } from "react";

/** The nearest ancestor that scrolls vertically (a dialog's body), or `null` for the viewport. */
function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
    const overflow = getComputedStyle(parent).overflowY;
    if (overflow === "auto" || overflow === "scroll") {
      return parent;
    }
  }
  return null;
}

/**
 * Whether an element has come within `margin` of the screen; it stays true once it has. Heavy
 * content below the fold (ticket samples, with their typefaces) waits for it. Inside a scrolling
 * container (a dialog), `root: "scroll-parent"` measures against that container instead.
 */
export function useNearScreen(
  margin = "800px",
  root: "viewport" | "scroll-parent" = "viewport",
): {
  /** Callback ref of the element to watch. */
  attach: (element: HTMLElement | null) => void;
  near: boolean;
} {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (element === null || near) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
        }
      },
      { root: root === "scroll-parent" ? scrollParent(element) : null, rootMargin: margin },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [element, margin, near, root]);

  return { attach: setElement, near };
}
