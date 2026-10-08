/**
 * Independent implementation of the written specification (docs/adr/0003 and 0004).
 *
 * Issuer and verifier in ticket-core share code (e.g. the signed-message layout), so a bug there
 * could be self-consistent and still pass the shared vectors. This test re-derives every issued
 * vector from the spec alone — its own Base45 decoder, its own byte layout, and Ed25519 from
 * Node's OpenSSL — so the Rust code is checked against the document, not against itself.
 */
import { createPrivateKey, createPublicKey, verify, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { VectorEvent } from "../src/generated/VectorEvent";
import type { VectorsFile } from "../src/generated/VectorsFile";

const vectors = JSON.parse(
  readFileSync(new URL("../../../testdata/vectors/ticket-v1.json", import.meta.url), "utf8"),
) as VectorsFile;

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const SIGNING_DOMAIN = new TextEncoder().encode("ingressoimpresso:ticket:v1");

/** RFC 9285 decoder written from the RFC, not from base45.rs. */
function base45Decode(text: string): Uint8Array {
  const out: number[] = [];
  for (let index = 0; index < text.length; index += 3) {
    const chunk = text.slice(index, index + 3);
    // QR text is ASCII; any other character fails the alphabet lookup below.
    const digits = chunk.split("").map((symbol) => {
      const value = ALPHABET.indexOf(symbol);
      if (value < 0) {
        throw new Error(`invalid symbol ${symbol}`);
      }
      return value;
    });
    const value = digits.reduce((sum, digit, position) => sum + digit * 45 ** position, 0);
    if (digits.length === 3) {
      if (value > 0xffff) {
        throw new Error("triple out of range");
      }
      out.push(value >> 8, value & 0xff);
    } else if (digits.length === 2) {
      if (value > 0xff) {
        throw new Error("pair out of range");
      }
      out.push(value);
    } else {
      throw new Error("dangling symbol");
    }
  }
  return Uint8Array.from(out);
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

/** UUID string → 16 bytes in RFC 9562 (big-endian) order. */
function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replaceAll("-", "");
  expect(hex).toMatch(/^[0-9a-f]{32}$/);
  return hexToBytes(hex);
}

function publicKey(hex: string): KeyObject {
  return createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(hex, "hex").toString("base64url") },
    format: "jwk",
  });
}

function event(name: string): VectorEvent {
  const found = vectors.events.find((candidate) => candidate.name === name);
  if (found === undefined) {
    throw new Error(`unknown vector event ${name}`);
  }
  return found;
}

function signedMessage(eventId: string, payload: Uint8Array): Uint8Array {
  return Uint8Array.from([...SIGNING_DOMAIN, ...uuidBytes(eventId), ...payload.subarray(0, 10)]);
}

describe("issued vectors match the written specification", () => {
  it.each(vectors.issued.map((issued) => [`${issued.event} #${String(issued.number)}`, issued] as const))(
    "%s",
    (_label, issued) => {
      const vectorEvent = event(issued.event);
      const key = vectorEvent.door.keys.find((candidate) => candidate.keyId === issued.keyId);
      expect(key).toBeDefined();

      // QR text: exactly 111 Base45 symbols encoding the 74-byte payload.
      expect(issued.qrText).toHaveLength(111);
      const payload = base45Decode(issued.qrText);
      expect(Buffer.from(payload).toString("hex")).toBe(issued.payloadHex);
      expect(payload).toHaveLength(74);

      // Header layout, big-endian.
      const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      expect(view.getUint8(0)).toBe(0x01);
      expect(view.getUint32(1)).toBe(vectorEvent.door.eventTag);
      expect(view.getUint8(5)).toBe(issued.keyId);
      expect(view.getUint32(6)).toBe(issued.number);

      // Ed25519 (OpenSSL) over domain ‖ event UUID ‖ header.
      const signature = payload.subarray(10);
      const message = signedMessage(vectorEvent.door.eventId, payload);
      expect(verify(null, message, publicKey(key?.publicKey ?? ""), signature)).toBe(true);

      // The same signature must not verify for any other event UUID.
      const otherEventId = event(issued.event === "other" ? "primary" : "other").door.eventId;
      expect(verify(null, signedMessage(otherEventId, payload), publicKey(key?.publicKey ?? ""), signature)).toBe(
        false,
      );
    },
  );

  it("publishes public keys that match the test-only seeds", () => {
    for (const vectorEvent of vectors.events) {
      for (const seed of vectorEvent.seeds) {
        const key = vectorEvent.door.keys.find((candidate) => candidate.keyId === seed.keyId);
        // PKCS#8 wrapper for a raw Ed25519 seed (RFC 8410).
        const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(seed.seed, "hex")]);
        const privateKey = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
        const derived = createPublicKey(privateKey).export({ format: "jwk" });
        expect(Buffer.from(derived.x ?? "", "base64url").toString("hex")).toBe(key?.publicKey);
      }
    }
  });
});
