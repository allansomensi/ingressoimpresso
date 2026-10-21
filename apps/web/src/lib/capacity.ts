/**
 * The venue's capacity (ADR 0110): how full it is, the same way on the door phones, in the live
 * view and in the warnings of the server (`capacity::level`).
 */

import { currentDay, type EventDay } from "@/lib/event-days";

export type CapacityLevel = "ok" | "near" | "full";

export interface CapacityState {
  /** Places left (never below zero). */
  left: number;
  /** Share of the limit taken, 0–1 (capped). */
  ratio: number;
  /** Below the warning, close to full, or full. */
  level: CapacityLevel;
}

export function capacityState(occupied: number, limit: number, warnPercent: number): CapacityState {
  const safeLimit = Math.max(1, limit);
  const level: CapacityLevel = occupied >= safeLimit ? "full" : occupied * 100 >= safeLimit * warnPercent ? "near" : "ok";
  return { left: Math.max(0, safeLimit - occupied), ratio: Math.min(1, Math.max(0, occupied / safeLimit)), level };
}

/** What a door phone knows for the count (its counters and the guest arrivals). */
export interface DoorCounts {
  /** Exit and return on: who is inside counts, not who ever entered. */
  reentry: boolean;
  entryCount: number;
  todayCount: number | null;
  insideCount: number;
}

/**
 * People in the venue as a door phone sees it: tickets in (today's, in an event of several days;
 * only those inside, with exit and return) and guests of the list who arrived (today's).
 */
export function doorOccupied(
  counts: DoorCounts,
  arrivals: readonly { people: number; atUnixMs: number; undoneAtMs: number | null }[],
  days: readonly EventDay[],
  nowMs: number,
): number {
  const today = currentDay(days, nowMs);
  const tickets = counts.reentry ? counts.insideCount : (counts.todayCount ?? counts.entryCount);
  const guests = arrivals
    .filter((arrival) => arrival.undoneAtMs === null && (today === null || currentDay(days, arrival.atUnixMs) === today))
    .reduce((sum, arrival) => sum + arrival.people, 0);
  return tickets + guests;
}
