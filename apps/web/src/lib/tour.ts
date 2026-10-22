/**
 * The welcome tour of the panel (ADR 0116): the steps, which element of the page each one points
 * at (`data-tour` in the panel's shell and the events page) and where its card goes. The
 * component is `components/panel/tour.tsx`.
 */

/** A step: centred (no anchor) or next to the element marked `data-tour="<anchor>"`. */
export interface TourStep {
  id: TourStepId;
  anchor: TourAnchor | null;
}

export type TourAnchor = "new-event" | "results" | "inbox" | "account";
export type TourStepId = "welcome" | "newEvent" | "results" | "inbox" | "account" | "done";

export const TOUR_STEPS: readonly TourStep[] = [
  { id: "welcome", anchor: null },
  { id: "newEvent", anchor: "new-event" },
  { id: "results", anchor: "results" },
  { id: "inbox", anchor: "inbox" },
  { id: "account", anchor: "account" },
  { id: "done", anchor: null },
];

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Room kept between the card and the screen's edges, and between the card and its element. */
export const TOUR_MARGIN = 16;
export const TOUR_GAP = 14;

/**
 * Where a card of `card` size goes: below its element when it fits, above otherwise, and against
 * the bottom edge when neither fits (a tall element on a short phone). Without an element, in the
 * middle. Always inside the screen.
 */
export function placeCard(target: Box | null, card: Size, screen: Size): { top: number; left: number; side: "below" | "above" | "center" } {
  const clamp = (value: number, max: number) => Math.min(Math.max(value, TOUR_MARGIN), Math.max(TOUR_MARGIN, max));
  const centeredLeft = clamp((screen.width - card.width) / 2, screen.width - card.width - TOUR_MARGIN);
  if (target === null) {
    return { top: clamp((screen.height - card.height) / 2, screen.height - card.height - TOUR_MARGIN), left: centeredLeft, side: "center" };
  }
  const left = clamp(target.left + target.width / 2 - card.width / 2, screen.width - card.width - TOUR_MARGIN);
  const below = target.top + target.height + TOUR_GAP;
  if (below + card.height <= screen.height - TOUR_MARGIN) {
    return { top: below, left, side: "below" };
  }
  const above = target.top - TOUR_GAP - card.height;
  if (above >= TOUR_MARGIN) {
    return { top: above, left, side: "above" };
  }
  return { top: clamp(screen.height - card.height - TOUR_MARGIN, screen.height), left, side: "center" };
}

/** The first element marked for `anchor` that is on screen (the header's link or the phone's bar). */
export function findAnchor(anchor: TourAnchor, root: ParentNode = document): HTMLElement | null {
  for (const element of root.querySelectorAll<HTMLElement>(`[data-tour="${anchor}"]`)) {
    const box = element.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) {
      return element;
    }
  }
  return null;
}
