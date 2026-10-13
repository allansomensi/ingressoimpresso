"use client";

import { useEffect, useState } from "react";

/**
 * Whether an element has come within `margin` of the screen; it stays true once it has. Heavy
 * content below the fold (ticket samples, with their typefaces) waits for it.
 */
export function useNearScreen(margin = "800px"): {
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
      { rootMargin: margin },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [element, margin, near]);

  return { attach: setElement, near };
}
