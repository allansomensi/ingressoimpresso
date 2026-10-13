"use client";

import { useCallback, useEffect, useState } from "react";

/** Which sides of a horizontal strip have more content past the edge. */
export interface ScrollEdges {
  /** The strip is wider than its box. */
  overflow: boolean;
  /** Content hidden on the left. */
  before: boolean;
  /** Content hidden on the right. */
  after: boolean;
}

const NONE: ScrollEdges = { overflow: false, before: false, after: false };

/**
 * A horizontal strip that a mouse can use too: which edges hide content (for fades and arrow
 * buttons), a `page` step of most of its width, and the vertical wheel scrolling it sideways
 * while there is room (a mouse wheel has no horizontal axis; the page scrolls at the ends).
 */
export function useScrollEdges(): ScrollEdges & {
  /** Callback ref of the strip (it may mount later, after its data loads). */
  attach: (element: HTMLElement | null) => void;
  page: (direction: 1 | -1) => void;
} {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [edges, setEdges] = useState<ScrollEdges>(NONE);

  useEffect(() => {
    if (element === null) {
      return;
    }
    const measure = () => {
      const max = element.scrollWidth - element.clientWidth;
      // One pixel of slack: zoomed screens report fractional widths.
      const next = { overflow: max > 1, before: element.scrollLeft > 1, after: element.scrollLeft < max - 1 };
      setEdges((current) =>
        current.overflow === next.overflow && current.before === next.before && current.after === next.after ? current : next,
      );
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
        return;
      }
      const max = element.scrollWidth - element.clientWidth;
      const room = event.deltaY > 0 ? element.scrollLeft < max - 1 : element.scrollLeft > 1;
      if (max <= 1 || !room) {
        return;
      }
      event.preventDefault();
      element.scrollLeft += event.deltaY;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) {
      observer.observe(child);
    }
    element.addEventListener("scroll", measure, { passive: true });
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", measure);
      element.removeEventListener("wheel", wheel);
    };
  }, [element]);

  const page = useCallback(
    (direction: 1 | -1) => {
      if (element !== null) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        element.scrollBy({ left: direction * element.clientWidth * 0.7, behavior: reduce ? "auto" : "smooth" });
      }
    },
    [element],
  );

  return { ...edges, attach: setElement, page };
}
