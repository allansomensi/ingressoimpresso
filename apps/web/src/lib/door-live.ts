/**
 * Rules of the live door view (ADR 0071): how fresh each phone is, the occupancy and the scale
 * of the entries curve. Pure, so they are unit tested.
 */
import type { DoorLiveDeviceDto, DoorLiveRefusalsDto } from "@ingressoimpresso/api-types";

/** The view polls this often while the tab is visible. */
export const LIVE_REFRESH_MS = 10_000;
/** A phone that has not synced for this long gets an alert. */
export const STALE_SYNC_MS = 5 * 60_000;
/** The live card shows on the overview from this long before the start to this long after the end. */
export const DOOR_DAY_MARGIN_MS = 6 * 3_600_000;

export type DeviceHealth = "ok" | "stale" | "never" | "revoked";

/** How a phone is doing: its last manifest (or contact) against now. */
export function deviceHealth(device: Pick<DoorLiveDeviceDto, "lastSyncAt" | "lastSeenAt" | "revoked">, now: number): DeviceHealth {
  if (device.revoked) {
    return "revoked";
  }
  const last = device.lastSyncAt ?? device.lastSeenAt;
  if (last === null) {
    return "never";
  }
  return now - Date.parse(last) > STALE_SYNC_MS ? "stale" : "ok";
}

/** "agora", "há 12 s", "há 3 min", "há 2 h". */
export function agoLabel(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 5) {
    return "agora";
  }
  if (seconds < 60) {
    return `há ${String(seconds)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `há ${String(minutes)} min`;
  }
  return `há ${String(Math.floor(minutes / 60))} h`;
}

/** Share of the sold tickets that entered, 0–1 for the bar (entries may pass sold with copies). */
export function occupancy(entries: number, sold: number): number {
  return sold <= 0 ? 0 : Math.min(1, entries / sold);
}

/** A clean top for the y axis, whose half (the middle tick) is a whole number too. */
export function niceMax(max: number, floor = 4): number {
  const target = Math.max(max, floor);
  const power = 10 ** Math.floor(Math.log10(target));
  for (const step of [1, 2, 4, 6, 8, 10]) {
    const top = step * power;
    if (top >= target && Number.isInteger(top / 2)) {
      return top;
    }
  }
  return 10 * power;
}

/** Readings that let nobody in. */
export function refusalCount(refusals: DoorLiveRefusalsDto): number {
  return refusals.blockedCopies + refusals.invalid + refusals.otherEvent + refusals.voided + refusals.wrongDoor;
}

/** Whether the event's door is open about now (the overview shows the live card). */
export function isDoorDay(startsAt: string, endsAt: string, now: number): boolean {
  return now >= Date.parse(startsAt) - DOOR_DAY_MARGIN_MS && now <= Date.parse(endsAt) + DOOR_DAY_MARGIN_MS;
}
