"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Pulled down this far (px), or flicked this fast (px/ms), a sheet closes. */
const CLOSE_DISTANCE = 96;
const CLOSE_SPEED = 0.45;
const SETTLE_MS = 200;

/**
 * Lets a bottom sheet be pulled down to close, like a native one (ADR 0060): a press on its grip
 * (any element marked `data-sheet-grip`: the handle and the header) drags the whole sheet; let go
 * far or fast enough and it slides away and closes, otherwise it springs back. The content under
 * the grip keeps scrolling as usual, and buttons inside the grip keep working.
 */
export function useSheetDrag(sheetRef: RefObject<HTMLElement | null>, enabled: boolean, onClose: () => void): void {
  // The latest callback, without re-binding the listeners on every render.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!enabled || sheet === null) {
      return;
    }
    let drag: { id: number; startY: number; lastY: number; lastTime: number; speed: number } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const reset = () => {
      sheet.style.transform = "";
      sheet.style.transition = "";
    };
    const down = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const onGrip = target !== null && target.closest("[data-sheet-grip]") !== null;
      const onControl = target !== null && target.closest("button, a, input, select, textarea, label") !== null;
      if (drag !== null || (event.pointerType === "mouse" && event.button !== 0) || !onGrip || onControl) {
        return;
      }
      drag = { id: event.pointerId, startY: event.clientY, lastY: event.clientY, lastTime: event.timeStamp, speed: 0 };
      sheet.setPointerCapture(event.pointerId);
      sheet.style.transition = "none";
    };
    const move = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId) {
        return;
      }
      const elapsed = Math.max(1, event.timeStamp - drag.lastTime);
      drag.speed = (event.clientY - drag.lastY) / elapsed;
      drag.lastY = event.clientY;
      drag.lastTime = event.timeStamp;
      // Upwards it barely moves (rubber band); downwards it follows the finger.
      const offset = event.clientY - drag.startY;
      sheet.style.transform = `translateY(${String(offset > 0 ? offset : offset / 8)}px)`;
    };
    const up = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId) {
        return;
      }
      const offset = event.clientY - drag.startY;
      const dismiss = event.type === "pointerup" && (offset > CLOSE_DISTANCE || (offset > 16 && drag.speed > CLOSE_SPEED));
      drag = null;
      if (Math.abs(offset) > 4) {
        // A drag is not a click: the backdrop must not read it as one (if a click follows at all).
        const swallow = (click: Event) => {
          click.stopPropagation();
        };
        sheet.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => {
          sheet.removeEventListener("click", swallow, { capture: true });
        }, 400);
      }
      sheet.style.transition = `transform ${String(SETTLE_MS)}ms cubic-bezier(0.2, 0.9, 0.25, 1)`;
      if (dismiss) {
        sheet.style.transform = "translateY(100%)";
        timer = setTimeout(() => {
          close.current();
          reset();
        }, SETTLE_MS);
      } else {
        sheet.style.transform = "";
        timer = setTimeout(reset, SETTLE_MS);
      }
    };

    sheet.addEventListener("pointerdown", down);
    sheet.addEventListener("pointermove", move);
    sheet.addEventListener("pointerup", up);
    sheet.addEventListener("pointercancel", up);
    return () => {
      clearTimeout(timer);
      sheet.removeEventListener("pointerdown", down);
      sheet.removeEventListener("pointermove", move);
      sheet.removeEventListener("pointerup", up);
      sheet.removeEventListener("pointercancel", up);
      reset();
    };
  }, [sheetRef, enabled]);
}

/** While a sheet or modal is open on a phone, the page under it does not scroll. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return;
    }
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [active]);
}
