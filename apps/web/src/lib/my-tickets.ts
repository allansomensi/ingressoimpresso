/**
 * "Meus ingressos" (ADR 0097): the digital tickets this phone already opened, listed at
 * `/ingresso` so the holder does not have to find the message again.
 *
 * The passes themselves live in the store of `lib/ticket-pass.ts` (under a hash of the token).
 * To open one again with fresh data, the page also keeps the link's token, encrypted with an
 * AES-GCM key the browser creates and never lets out (`extractable: false`): what is stored is of
 * no use anywhere else, as invariant 11 asks of everything a private link leaves on the phone.
 */
import type { TicketPassDto } from "@ingressoimpresso/api-types";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import { storedPasses } from "@/lib/ticket-pass";
import { tokenKey } from "@/lib/token-key";

interface SealedLink {
  /** `tokenKey(token)`: the same key as the saved pass. */
  key: string;
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}

interface WalletDb extends DBSchema {
  secret: { key: string; value: CryptoKey };
  links: { key: string; value: SealedLink };
}

const DB_NAME = "ingressoimpresso-meus-ingressos";
const SECRET = "aes";

let opening: Promise<IDBPDatabase<WalletDb>> | null = null;

function database(): Promise<IDBPDatabase<WalletDb>> {
  opening ??= openDB<WalletDb>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore("secret");
      db.createObjectStore("links", { keyPath: "key" });
    },
  });
  return opening;
}

/** The phone's key: made once, usable only here (it can encrypt and decrypt, never be read). */
async function secret(db: IDBPDatabase<WalletDb>): Promise<CryptoKey> {
  const existing = await db.get("secret", SECRET);
  if (existing !== undefined) {
    return existing;
  }
  const created = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await db.put("secret", created, SECRET);
  return created;
}

/** Keeps the link of a ticket that opened, so the list can open it again. Best effort. */
export async function rememberLink(token: string): Promise<void> {
  try {
    const db = await database();
    const key = await tokenKey(token);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await secret(db), new TextEncoder().encode(token));
    await db.put("links", { key, iv, data });
  } catch {
    // Private mode or no IndexedDB: the ticket still shows; it just will not be in the list.
  }
}

/** The token of a listed ticket, or `null` when this phone cannot open it any more. */
export async function openLink(key: string): Promise<string | null> {
  try {
    const db = await database();
    const sealed = await db.get("links", key);
    if (sealed === undefined) {
      return null;
    }
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: sealed.iv }, await secret(db), sealed.data);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

/** Forgets the link of a ticket (revoked, transferred or removed from the list). */
export async function forgetLink(key: string): Promise<void> {
  try {
    await (await database()).delete("links", key);
  } catch {
    // Nothing to forget.
  }
}

export interface MyTicket {
  key: string;
  pass: TicketPassDto;
  /** The phone can open it again with fresh data (it kept the link). */
  openable: boolean;
}

/** The tickets of the list: those still ahead first (soonest on top), then the ones past. */
export function sortMyTickets(tickets: readonly MyTicket[], now: number): { upcoming: MyTicket[]; past: MyTicket[] } {
  const end = (ticket: MyTicket) => Date.parse(ticket.pass.event.endsAt);
  const start = (ticket: MyTicket) => Date.parse(ticket.pass.event.startsAt);
  const upcoming = tickets.filter((ticket) => !(end(ticket) < now)).sort((a, b) => start(a) - start(b) || a.pass.number - b.pass.number);
  const past = tickets.filter((ticket) => end(ticket) < now).sort((a, b) => start(b) - start(a) || a.pass.number - b.pass.number);
  return { upcoming, past };
}

/** Every ticket saved on this phone, and whether its link is kept. Links of forgotten passes go. */
export async function myTickets(): Promise<MyTicket[]> {
  const passes = storedPasses();
  let keys = new Set<string>();
  try {
    const db = await database();
    keys = new Set(await db.getAllKeys("links"));
    const saved = new Set(passes.map((entry) => entry.key));
    await Promise.all([...keys].filter((key) => !saved.has(key)).map((key) => db.delete("links", key)));
  } catch {
    // Without IndexedDB the saved copies are still listed.
  }
  return passes.map((entry) => ({ key: entry.key, pass: entry.pass, openable: keys.has(entry.key) }));
}
