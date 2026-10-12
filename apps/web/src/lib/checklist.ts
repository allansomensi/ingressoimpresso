/**
 * The checklist of what is missing before the event (ADR 0078). The API works out each item;
 * here is only where each one is done in the panel.
 */

import type { ChecklistDto, ChecklistItemDto, ChecklistKey } from "@ingressoimpresso/api-types";

import type { Tab } from "@/components/event/tabs";

/** Where an item is done: a tab of the event, the event form, or the organization's profile. */
export type ChecklistTarget = { kind: "tab"; tab: Tab } | { kind: "edit" } | { kind: "profile" };

const TARGETS: Record<ChecklistKey, ChecklistTarget> = {
  details: { kind: "edit" },
  design: { kind: "tab", tab: "design" },
  art: { kind: "tab", tab: "design" },
  categories: { kind: "tab", tab: "categories" },
  batch: { kind: "tab", tab: "batches" },
  sellers: { kind: "tab", tab: "sellers" },
  seller_links: { kind: "tab", tab: "sellers" },
  delivery: { kind: "tab", tab: "files" },
  door_link: { kind: "tab", tab: "door" },
  rehearsal: { kind: "tab", tab: "door" },
  guests: { kind: "tab", tab: "guests" },
  public_verify: { kind: "tab", tab: "digital" },
  organization_contact: { kind: "profile" },
};

export function checklistTarget(key: ChecklistKey): ChecklistTarget {
  return TARGETS[key];
}

/** The items shown: the ones that apply. */
export function shownItems(list: ChecklistDto): ChecklistItemDto[] {
  return list.items.filter((item) => item.state !== "not_applicable");
}

/** Whether every required item is done (the card folds away). */
export function isComplete(list: ChecklistDto): boolean {
  return list.applies && list.missing === 0;
}

/** Items to do first (missing and optional), then the ones done, each group in the work's order. */
export function splitItems(list: ChecklistDto): { open: ChecklistItemDto[]; done: ChecklistItemDto[] } {
  const items = shownItems(list);
  return {
    open: items.filter((item) => item.state === "missing" || item.state === "optional"),
    done: items.filter((item) => item.state === "done"),
  };
}

/** Required items done, for "6 de 9 prontos". */
export function requiredDone(list: ChecklistDto): number {
  return list.required - list.missing;
}
