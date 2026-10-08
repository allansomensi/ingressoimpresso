import type { DecisionDto } from "./generated/DecisionDto";
import type { FirstEntryDto } from "./generated/FirstEntryDto";
import type { InvalidReasonDto } from "./generated/InvalidReasonDto";
import type { VoidReasonDto } from "./generated/VoidReasonDto";

// Exhaustive by construction: adding a variant to the generated union fails to compile here
// until it is listed, instead of making `parseDecision` throw at the door.
const VOID_REASONS = Object.keys({
  unsold: true,
  lost: true,
  revoked: true,
} satisfies Record<VoidReasonDto, true>) as readonly VoidReasonDto[];
const INVALID_REASONS = Object.keys({
  malformed: true,
  unknown_key: true,
  revoked_key: true,
  bad_signature: true,
} satisfies Record<InvalidReasonDto, true>) as readonly InvalidReasonDto[];
const KINDS = Object.keys({
  admit: true,
  already_entered: true,
  voided: true,
  other_event: true,
  invalid: true,
} satisfies Record<DecisionDto["kind"], true>) as readonly DecisionDto["kind"][];

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
  const kind = oneOf(value, "kind", KINDS);
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
    default: {
      const unreachable: never = kind;
      throw new TypeError(`decision.kind ${String(unreachable)} is not handled`);
    }
  }
}
