import type { DecisionDto } from "./generated/DecisionDto";
import type { FirstEntryDto } from "./generated/FirstEntryDto";
import type { InvalidReasonDto } from "./generated/InvalidReasonDto";
import type { VoidReasonDto } from "./generated/VoidReasonDto";

const VOID_REASONS = ["unsold", "lost", "revoked"] as const satisfies readonly VoidReasonDto[];
const INVALID_REASONS = [
  "malformed",
  "unknown_key",
  "revoked_key",
  "bad_signature",
] as const satisfies readonly InvalidReasonDto[];

type JsonRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integer(record: JsonRecord, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError(`decision.${key} is not a safe integer`);
  }
  return value;
}

function text(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new TypeError(`decision.${key} is not a string`);
  }
  return value;
}

function oneOf<const T extends string>(record: JsonRecord, key: string, allowed: readonly T[]): T {
  const value = record[key];
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new TypeError(`decision.${key} has an unexpected value`);
  }
  return match;
}

function firstEntry(record: JsonRecord): FirstEntryDto {
  const value = record["firstEntry"];
  if (!isRecord(value)) {
    throw new TypeError("decision.firstEntry is not an object");
  }
  return { atUnixMs: integer(value, "atUnixMs"), deviceName: text(value, "deviceName") };
}

/**
 * Validates a value returned by the WebAssembly module and narrows it to `DecisionDto`.
 *
 * The module is ours and its types are generated from the same Rust structs, so a failure here
 * means a build mismatch (stale `pkg/`), not bad user input.
 */
export function parseDecision(value: unknown): DecisionDto {
  if (!isRecord(value)) {
    throw new TypeError("decision is not an object");
  }
  const kind = value["kind"];
  switch (kind) {
    case "admit":
      return { kind, number: integer(value, "number") };
    case "already_entered":
      return { kind, number: integer(value, "number"), firstEntry: firstEntry(value) };
    case "voided":
      return { kind, number: integer(value, "number"), reason: oneOf(value, "reason", VOID_REASONS) };
    case "other_event":
      return { kind, eventTag: integer(value, "eventTag") };
    case "invalid":
      return { kind, reason: oneOf(value, "reason", INVALID_REASONS) };
    default:
      throw new TypeError("decision.kind has an unexpected value");
  }
}
