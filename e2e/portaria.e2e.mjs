// End-to-end test of the door (phase 4): five "phones" (separate Chromium instances with a fake
// camera showing a printed ticket) against the real API and the production web build.
//
// Run with `just e2e`, which starts Postgres-backed API and `next start` first. Covers: link
// registration, manifest, camera + zxing reading, local decision, online confirmation of a copy,
// the app opening offline from the service worker, an offline decision, sync on reconnect and
// convergence of the first entry across phones; then the door features (ADRs 0067–0071):
// rehearsal, a door limited to a category, the guest list and the live view; and an event of
// several days (ADRs 0089–0092): a day a ticket is not valid on, the instruction on the green
// screen, a check that records nothing (and records on request) and a checkpoint.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { chromium } from "playwright";

const API = process.env.E2E_API ?? "http://localhost:8080";
const WEB = process.env.E2E_WEB ?? "http://localhost:3000";
const API_LOG = process.env.E2E_API_LOG ?? "target/e2e/api.log";
const OUT = resolve(process.env.E2E_OUT ?? "target/e2e");
const EMAIL = process.env.E2E_EMAIL ?? "e2e@exemplo.com";
const TIMEOUT = 20_000;

mkdirSync(OUT, { recursive: true });

async function api(path, { token, body, method } = {}) {
  const headers = {};
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${API}${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${path}: ${response.status} ${await response.text()}`);
  }
  const type = response.headers.get("content-type") ?? "";
  if (response.status === 204) return null;
  return type.includes("application/json") ? response.json() : Buffer.from(await response.arrayBuffer());
}

async function until(what, check, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((done) => setTimeout(done, 300));
  }
}

/** Signs in with the code printed by the development mailer in the API log. */
async function login() {
  const before = readFileSync(API_LOG, "utf8").length;
  await api("/api/auth/code", { body: { email: EMAIL } });
  const code = await until("login code", () => {
    const log = readFileSync(API_LOG, "utf8").slice(before);
    // The code is the only 6-digit number of the subject ("Seu código de acesso: 123456").
    return /development mailer[^\n]*?subject\S*?=\S*?[^\d\n]*(\d{6})/.exec(log)?.[1];
  });
  return (await api("/api/auth/verify", { body: { email: EMAIL, code } })).token;
}

/** RFC 4648 base32 (no padding), as the authenticator setup prints the key. */
function base32Decode(text) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const out = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text.replace(/\s/g, "")) {
    buffer = (buffer << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

/** The 6-digit TOTP (RFC 6238, SHA-1, 30 s) of `secret` now. */
function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const digest = createHmac("sha1", secret).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(value % 1_000_000).padStart(6, "0");
}

/** Admin powers need two-step verification (ADR 0047): the e2e account turns it on like a person. */
async function enableTwoFactor(token) {
  const setup = await api("/api/account/two-factor/setup", { token, body: {} });
  await api("/api/account/two-factor/enable", { token, body: { code: totp(base32Decode(setup.secret)) } });
}

/** The entries of a ZIP written by the API (stored, sizes in the local headers). */
function unzip(buffer) {
  const files = new Map();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString("utf8", offset + 30, offset + 30 + nameLength);
    const start = offset + 30 + nameLength + extraLength;
    files.set(name, buffer.subarray(start, start + size));
    offset = start + size;
  }
  return files;
}

/** A 1280×720 MJPEG "camera" filming the QR side of a ticket image. */
async function cameraFile(browser, jpeg, name) {
  const page = await browser.newPage();
  const frame = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/jpeg;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext("2d");
    context.fillStyle = "#777";
    context.fillRect(0, 0, 1280, 720);
    // The right 45% of the ticket (where the QR is), scaled to the frame height.
    const sx = image.width * 0.55;
    const sw = image.width - sx;
    const scale = 660 / image.height;
    context.drawImage(image, sx, 0, sw, image.height, (1280 - sw * scale) / 2, 30, sw * scale, 660);
    const blob = await new Promise((done) => canvas.toBlob(done, "image/jpeg", 0.92));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, jpeg.toString("base64"));
  await page.close();
  const bytes = Buffer.from(frame, "base64");
  const path = join(OUT, `${name}.mjpeg`);
  writeFileSync(path, Buffer.concat(Array.from({ length: 30 }, () => bytes)));
  return path;
}

/**
 * Pauses reading with the ticket still in front of the fake camera. The same code seen again
 * re-shows its result (without a new scan), which keeps covering the pause button, so the click is
 * dispatched to the button itself; then the last result is dismissed for good.
 */
async function pauseReading(page) {
  await page.getByRole("button", { name: "Pausar" }).dispatchEvent("click");
  await page.getByRole("button", { name: "Começar a ler" }).waitFor({ timeout: TIMEOUT });
  const dismiss = page.getByRole("button", { name: "Toque para continuar" });
  if (await dismiss.isVisible()) {
    await dismiss.click();
  }
}

/** A phone: its own browser, profile and camera. */
async function phone(camera) {
  const browser = await chromium.launch({
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${camera}`,
    ],
  });
  const context = await browser.newContext({ permissions: ["camera"], viewport: { width: 400, height: 800 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("page error:", error.message));
  return { browser, context, page };
}

async function register({ page }, link, name) {
  await page.goto(link);
  await page.getByLabel("Nome do celular").fill(name);
  await page.getByRole("button", { name: "Registrar" }).click();
  await page.getByText(/Dados do evento atualizados/).waitFor({ timeout: TIMEOUT });
}

/** Starts reading and returns the first result screen (saved as `<name>.png`). */
async function readOnce({ page }, name) {
  await page.screenshot({ path: join(OUT, `${name}-ready.png`) });
  await page.getByRole("button", { name: "Começar a ler" }).click();
  const result = page.locator("[data-tone]");
  await result.waitFor({ timeout: TIMEOUT });
  await page.screenshot({ path: join(OUT, `${name}-result.png`) });
  return { tone: await result.getAttribute("data-tone"), text: await result.innerText() };
}

const token = await login();
const event = await api("/api/events", {
  token,
  body: {
    name: "Ensaio da portaria",
    venue: "Garagem",
    startsAt: new Date(Date.now() - 3_600_000).toISOString(),
    endsAt: new Date(Date.now() + 6 * 3_600_000).toISOString(),
    ticketPriceCents: 2000,
  },
});
let twoFactor = false;

/** Five paid tickets of `eventId`, all with the seller João; returns each ticket's image. */
async function fiveTickets(eventId) {
  const batch = await api(`/api/events/${eventId}/batches`, { token, body: { quantity: 5 } });
  // Free tickets (ADR 0039) may cover the batch already; otherwise the admin marks it as paid.
  if (batch.status !== "paid") {
    if (!twoFactor) {
      await enableTwoFactor(token);
      twoFactor = true;
    }
    await api(`/api/admin/batches/${batch.id}/mark-paid`, { token, method: "POST" });
  }
  const seller = await api(`/api/events/${eventId}/sellers`, { token, body: { name: "João" } });
  await api(`/api/sellers/${seller.id}/ranges`, { token, body: { first: 1, last: 5 } });
  const exported = await api(`/api/events/${eventId}/exports`, {
    token,
    body: { kind: "whatsapp", scope: { type: "all" } },
  });
  await until("WhatsApp export", async () => (await api(`/api/exports/${exported.id}`, { token })).status === "done");
  const link = await api(`/api/exports/${exported.id}/link`, { token, method: "POST" });
  const zip = unzip(await (await fetch(link.url)).arrayBuffer().then((bytes) => Buffer.from(bytes)));
  return (number) => zip.get(`João/${String(number).padStart(4, "0")}.jpg`);
}

const ticket = await fiveTickets(event.id);
assert.ok(ticket(1) && ticket(2), "the ZIP holds the tickets");

const access = await api(`/api/events/${event.id}/door/accesses`, { token, body: { label: "Ensaio" } });
const doorLink = `${WEB}/portaria#acesso=${access.token}`;

const helper = await chromium.launch();
const camera1 = await cameraFile(helper, ticket(1), "ticket-1");
const camera2 = await cameraFile(helper, ticket(2), "ticket-2");
const camera4 = await cameraFile(helper, ticket(4), "ticket-4");
await helper.close();

// 0. Rehearsal on A before the doors open (ADR 0067): a real ticket shows what would happen and
// nothing is recorded. The option lives in the ⋮ menu only while nobody has entered yet.
const a = await phone(camera1);
await register(a, doorLink, "Porta A");
await a.page.getByRole("button", { name: "Mais opções" }).click();
await a.page.getByRole("button", { name: /^Ensaiar/ }).click();
await a.page.getByText("ENSAIO · nada é registrado").waitFor({ timeout: TIMEOUT });
let result = await readOnce(a, "a-rehearsal");
assert.equal(result.tone, "warn", result.text);
assert.match(result.text, /Ensaio: nada foi registrado[\s\S]*ENTRARIA[\s\S]*Nº 0001/);
await pauseReading(a.page);
await a.page.getByRole("button", { name: "Terminar ensaio" }).click();
await until("rehearsal on the server", async () => {
  const devices = (await api(`/api/events/${event.id}/door`, { token })).devices;
  const phoneA = devices.find((device) => device.name === "Porta A");
  return phoneA.rehearsedAt !== null && phoneA.scanCount === 0;
});
console.log("ok: rehearsal reported, nothing scanned");

// 1. A admits ticket 1; B, online, is told it already entered through A.
result = await readOnce(a, "a");
assert.equal(result.tone, "ok", result.text);
assert.match(result.text, /PODE ENTRAR[\s\S]*Nº 0001[\s\S]*Vendedor: João/);

const b = await phone(camera1);
await register(b, doorLink, "Porta B");
result = await readOnce(b, "b");
assert.equal(result.tone, "bad", result.text);
assert.match(result.text, /JÁ ENTROU[\s\S]*por Porta A/);
console.log("ok: online copy detected");
await pauseReading(b.page);
await b.page.getByRole("button", { name: "Mais opções" }).click();
assert.equal(await b.page.getByRole("button", { name: /^Ensaiar/ }).count(), 0, "no rehearsal once tickets entered");

// 2. C prepares, loses the network, reopens the app offline and admits ticket 2 on its own.
const c = await phone(camera2);
await register(c, doorLink, "Porta C");
await until("app cached for offline use", async () =>
  (await c.page.locator("li", { hasText: "App salvo para abrir sem internet" }).getAttribute("data-ok")) === "true",
);
// Both WebAssembly files are in the cache before the first read: the QR reader's is not loaded
// by the page until the camera starts.
const cachedWasm = await c.page.evaluate(async () =>
  (await (await caches.open("portaria-v1")).keys()).map((request) => new URL(request.url).pathname).filter((path) => path.endsWith(".wasm")),
);
assert.equal(cachedWasm.length, 2, `cached wasm: ${cachedWasm.join(", ")}`);
await c.context.setOffline(true);
await c.page.reload();
await c.page.getByText(/Dados do evento atualizados/).waitFor({ timeout: TIMEOUT });
result = await readOnce(c, "c-offline");
assert.equal(result.tone, "ok", result.text);
assert.match(result.text, /Nº 0002/);
await c.page.getByText("1 leitura não sincronizada").waitFor({ timeout: TIMEOUT });
console.log("ok: offline app and offline decision");

// 3. D, online, also admits ticket 2: the server has not heard from C yet.
const d = await phone(camera2);
await register(d, doorLink, "Porta D");
result = await readOnce(d, "d");
assert.equal(result.tone, "ok", result.text);

// 4. C reconnects and syncs; a new phone sees C (the earliest) as the first entry.
await c.context.setOffline(false);
await c.page.getByText(/leitura não sincronizada/).waitFor({ state: "detached", timeout: TIMEOUT });
const overview = await api(`/api/events/${event.id}/door`, { token });
assert.equal(overview.entryCount, 2);
const e = await phone(camera2);
await register(e, doorLink, "Porta E");
result = await readOnce(e, "e");
assert.equal(result.tone, "bad", result.text);
assert.match(result.text, /JÁ ENTROU[\s\S]*por Porta C/);
console.log("ok: entries converge after sync");

// 5. A door for the VIP category (ADR 0068): a pista ticket is sent elsewhere, then let in as
// an exception. The guest list (ADR 0070) is checked on the same phone, offline-first.
const vip = await api(`/api/events/${event.id}/categories`, { token, body: { name: "VIP", color: "#7c3aed", priceCents: null } });
await api(`/api/categories/${vip.id}/ranges`, { token, body: { first: 3, last: 3 } });
const pista = await api(`/api/events/${event.id}/categories`, { token, body: { name: "Pista", color: "#2563eb", priceCents: null } });
await api(`/api/categories/${pista.id}/ranges`, { token, body: { first: 4, last: 5 } });
await api(`/api/events/${event.id}/guests`, { token, body: { name: "Maria Souza", companions: 1 } });
const vipAccess = await api(`/api/events/${event.id}/door/accesses`, { token, body: { label: "Porta VIP", categoryIds: [vip.id] } });
const f = await phone(camera4);
await register(f, `${WEB}/portaria#acesso=${vipAccess.token}`, "Porta F");
result = await readOnce(f, "f-wrong-door");
assert.equal(result.tone, "warn", result.text);
assert.match(result.text, /OUTRA PORTA[\s\S]*Pista: entrada pela Ensaio[\s\S]*Nº 0004/);
await f.page.getByRole("button", { name: "Deixar entrar mesmo assim" }).click();
await f.page.locator('[data-tone="ok"]').waitFor({ timeout: TIMEOUT });
await pauseReading(f.page);
await f.page.getByRole("button", { name: "Lista" }).click();
await f.page.getByRole("searchbox").fill("maria");
await f.page.getByRole("button", { name: "Chegou" }).click();
await f.page.getByRole("button", { name: "Entraram 2 pessoas" }).click();
await f.page.getByText("Chegada registrada").waitFor({ timeout: TIMEOUT });
await f.page.screenshot({ path: join(OUT, "f-guests.png") });
const live = await until("the live view", async () => {
  const now = await api(`/api/events/${event.id}/door/live`, { token });
  // The refusal goes up with the next sync; the exception was confirmed online right away.
  return now.guests.arrivedPeople === 2 && now.refusals.wrongDoorAdmitted === 1 && now.refusals.wrongDoor === 1 ? now : null;
});
assert.equal(live.entries, 3);
assert.equal(live.refusals.wrongDoor, 1);
console.log("ok: wrong door, exception, guest list and live view");

// 6. The painel report shows the door's work per seller (once E has uploaded its rejection).
await until("E's scan on the server", async () => {
  const report = await api(`/api/events/${event.id}/report`, { token });
  return report.totals.blockedCopies === 2;
});
const painel = await chromium.launch();
const organizer = await painel.newPage({ viewport: { width: 1280, height: 900 } });
await organizer.goto(`${WEB}/entrar`);
await organizer.evaluate((value) => {
  window.localStorage.setItem("ingressoimpresso.session", value);
}, token);
await organizer.goto(`${WEB}/painel/eventos/${event.id}`);
// An announcement published as a dialog (ADR 0038) opens over the panel: close it first.
const announcement = organizer.locator("dialog[open]").getByRole("button", { name: "Entendi" });
await announcement
  .waitFor({ state: "visible", timeout: 3_000 })
  .then(() => announcement.click())
  .catch(() => undefined);
// The sections of the event sit in a navigation down the side (ADR 0087).
await organizer.getByRole("navigation", { name: "Seções do evento" }).getByRole("button", { name: "Relatório" }).click();
// The report has a settlement table and a door table (ADR 0050), each with its own total.
const totalOf = (table) => organizer.getByRole("table", { name: table }).locator("tr", { hasText: "Total" });
const settlement = totalOf("Acerto por vendedor");
const door = totalOf("Portaria por vendedor");
await settlement.waitFor({ timeout: TIMEOUT });
await organizer.screenshot({ path: join(OUT, "report.png"), fullPage: true });
// Tickets, unsold, lost, other voids, sold.
const sold = (await settlement.locator("td").allInnerTexts()).slice(1, 6).map(Number);
assert.deepEqual(sold, [5, 0, 0, 0, 5]);
// Entries, offline copies, blocked copies, voided entries.
const entered = (await door.locator("td").allInnerTexts()).slice(1, 5).map(Number);
assert.deepEqual(entered, [3, 1, 2, 0]);
await painel.close();
console.log("ok: report counts the door");

for (const device of [a, b, c, d, e, f]) {
  await device.browser.close();
}

// 7. An event of two days (ADR 0091): yesterday and today. Passes enter every day and get a
// wristband (ADR 0089); "Sábado" was valid only yesterday; "1 dia" enters once. A check (ADR
// 0090) records nothing until asked; dinner (ADR 0092) is for passes, once a day.
const hour = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();
const now = Date.now();
const days = [
  { startsAt: iso(now - 26 * hour), endsAt: iso(now - 20 * hour) },
  { startsAt: iso(now - hour), endsAt: iso(now + 6 * hour) },
];
const weekend = await api("/api/events", {
  token,
  body: { name: "Encontro de dois dias", venue: "Sítio", startsAt: days[0].startsAt, endsAt: days[1].endsAt, ticketPriceCents: 5000, days },
});
assert.equal(weekend.days.length, 2);
const category = async (name, color, first, last, extra) => {
  const created = await api(`/api/events/${weekend.id}/categories`, { token, body: { name, color, priceCents: null, ...extra } });
  await api(`/api/categories/${created.id}/ranges`, { token, body: { first, last } });
  return created;
};
const pass = await category("Passe", "#ea580c", 1, 2, { doorInstruction: "Pulseira laranja" });
await category("Sábado", "#2563eb", 3, 3, { dayRule: "days", validDays: [1] });
await category("1 dia", "#16a34a", 4, 5, { dayRule: "any_one" });
const dinner = await api(`/api/events/${weekend.id}/checkpoints`, {
  token,
  body: { name: "Janta", instruction: "Entregar o prato", perDay: true, categoryIds: [pass.id] },
});
const gate = await api(`/api/events/${weekend.id}/door/accesses`, { token, body: { label: "Portão" } });
const dinnerLink = await api(`/api/events/${weekend.id}/door/accesses`, { token, body: { label: "Janta", checkpointId: dinner.id } });
assert.equal(dinnerLink.access.checkpointId, dinner.id);
const weekendTicket = await fiveTickets(weekend.id);
const tools = await chromium.launch();
const passCamera = await cameraFile(tools, weekendTicket(1), "weekend-1");
const saturdayCamera = await cameraFile(tools, weekendTicket(3), "weekend-3");
const oneDayCamera = await cameraFile(tools, weekendTicket(4), "weekend-4");
await tools.close();
const gateLink = `${WEB}/portaria#acesso=${gate.token}`;
const dinnerUrl = `${WEB}/portaria#acesso=${dinnerLink.token}`;

// A pass enters today with its wristband: the green screen waits for the tap.
const g = await phone(passCamera);
await register(g, gateLink, "Portão G");
await g.page.getByText(/dia 2 de 2/).waitFor({ timeout: TIMEOUT });
result = await readOnce(g, "g-pass");
assert.equal(result.tone, "ok", result.text);
assert.match(result.text, /PODE ENTRAR[\s\S]*Nº 0001[\s\S]*pulseira laranja/i);
await g.page.waitForTimeout(2_500);
assert.equal(await g.page.locator('[data-tone="ok"]').count(), 1, "the instruction holds the screen");
await g.browser.close();

// "Sábado" was valid yesterday only: turned away, then let in as an exception.
const h = await phone(saturdayCamera);
await register(h, gateLink, "Portão H");
result = await readOnce(h, "h-wrong-day");
assert.equal(result.tone, "warn", result.text);
assert.match(result.text, /NÃO VALE HOJE[\s\S]*vale só[\s\S]*Nº 0003/);
await h.page.getByRole("button", { name: "Deixar entrar mesmo assim" }).click();
await h.page.locator('[data-tone="ok"]').waitFor({ timeout: TIMEOUT });
// H stays open: its refusal goes up with the next sync (the exception was confirmed online).
console.log("ok: days, the wristband and a day the ticket is not valid");

// A check (ADR 0090): the pass is there; the "1 dia" is not, and is recorded on request.
const i = await phone(passCamera);
await register(i, gateLink, "Ronda I");
await i.page.getByRole("radio", { name: "Conferir" }).click();
await i.page.getByText("CONFERÊNCIA · só consulta, nada é registrado").waitFor({ timeout: TIMEOUT });
result = await readOnce(i, "i-check-passed");
assert.equal(result.tone, "ok", result.text);
assert.match(result.text, /Conferência: nada foi registrado[\s\S]*PASSOU PELA ENTRADA[\s\S]*Portão G/);
await i.browser.close();
const j = await phone(oneDayCamera);
await register(j, gateLink, "Ronda J");
await j.page.getByRole("radio", { name: "Conferir" }).click();
result = await readOnce(j, "j-check-missing");
assert.equal(result.tone, "warn", result.text);
assert.match(result.text, /NÃO PASSOU PELA ENTRADA[\s\S]*Nº 0004/);
const before = (await api(`/api/events/${weekend.id}/door`, { token })).entryCount;
assert.equal(before, 2, "a check records nothing");
await j.page.getByRole("button", { name: "Registrar a entrada agora" }).click();
await j.page.locator('[data-tone="ok"]').waitFor({ timeout: TIMEOUT });
assert.match(await j.page.locator("[data-tone]").innerText(), /PODE ENTRAR[\s\S]*Nº 0004/);
await j.browser.close();
console.log("ok: a check records nothing, and records on request");

// Dinner (ADR 0092): the pass gets it once; a second phone says it was used; "1 dia" has no right.
const k = await phone(passCamera);
await register(k, dinnerUrl, "Janta K");
await k.page.getByText("PONTO DE CONTROLE · Janta").waitFor({ timeout: TIMEOUT });
result = await readOnce(k, "k-dinner");
assert.equal(result.tone, "ok", result.text);
assert.match(result.text, /JANTA[\s\S]*LIBERADO[\s\S]*entregar o prato/i);
await k.browser.close();
const l = await phone(passCamera);
await register(l, dinnerUrl, "Janta L");
result = await readOnce(l, "l-dinner-again");
assert.equal(result.tone, "bad", result.text);
assert.match(result.text, /JÁ USOU[\s\S]*Janta K/);
const m = await phone(oneDayCamera);
await register(m, dinnerUrl, "Janta M");
result = await readOnce(m, "m-no-right");
assert.equal(result.tone, "warn", result.text);
assert.match(result.text, /SEM DIREITO[\s\S]*1 dia/);
const weekendLive = await until("the live view of the weekend", async () => {
  const view = await api(`/api/events/${weekend.id}/door/live`, { token });
  const janta = view.checkpoints.find((item) => item.id === dinner.id);
  return janta !== undefined && janta.repeats === 1 && janta.notEntitled === 1 && view.refusals.wrongDay === 1 ? view : null;
});
for (const device of [h, l, m]) {
  await device.browser.close();
}
assert.equal(weekendLive.today, 2);
assert.deepEqual(
  weekendLive.days.map((day) => day.entries),
  [0, 3],
);
assert.equal(weekendLive.entries, 3, "a dinner is never an entry");
assert.equal(weekendLive.refusals.wrongDayAdmitted, 1);
assert.equal(weekendLive.checkpoints[0].used, 1);
assert.equal(weekendLive.checkpoints[0].entitled, 2);
console.log("ok: a checkpoint with its own book, and the live view of the days");

console.log("door e2e: all checks passed");
