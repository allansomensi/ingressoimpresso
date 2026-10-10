// End-to-end test of the door (phase 4): five "phones" (separate Chromium instances with a fake
// camera showing a printed ticket) against the real API and the production web build.
//
// Run with `just e2e`, which starts Postgres-backed API and `next start` first. Covers: link
// registration, manifest, camera + zxing reading, local decision, online confirmation of a copy,
// the app opening offline from the service worker, an offline decision, sync on reconnect and
// convergence of the first entry across phones.
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
const batch = await api(`/api/events/${event.id}/batches`, { token, body: { quantity: 5 } });
// Free tickets (ADR 0039) may cover the batch already; otherwise the admin marks it as paid.
if (batch.status !== "paid") {
  await enableTwoFactor(token);
  await api(`/api/admin/batches/${batch.id}/mark-paid`, { token, method: "POST" });
}
const seller = await api(`/api/events/${event.id}/sellers`, { token, body: { name: "João" } });
await api(`/api/sellers/${seller.id}/ranges`, { token, body: { first: 1, last: 5 } });

const exported = await api(`/api/events/${event.id}/exports`, {
  token,
  body: { kind: "whatsapp", scope: { type: "all" } },
});
await until("WhatsApp export", async () => (await api(`/api/exports/${exported.id}`, { token })).status === "done");
const link = await api(`/api/exports/${exported.id}/link`, { token, method: "POST" });
const zip = unzip(await (await fetch(link.url)).arrayBuffer().then((bytes) => Buffer.from(bytes)));
const ticket = (number) => zip.get(`João/${String(number).padStart(4, "0")}.jpg`);
assert.ok(ticket(1) && ticket(2), "the ZIP holds the tickets");

const access = await api(`/api/events/${event.id}/door/accesses`, { token, body: { label: "Ensaio" } });
const doorLink = `${WEB}/portaria#acesso=${access.token}`;

const helper = await chromium.launch();
const camera1 = await cameraFile(helper, ticket(1), "ticket-1");
const camera2 = await cameraFile(helper, ticket(2), "ticket-2");
await helper.close();

// 1. A admits ticket 1; B, online, is told it already entered through A.
const a = await phone(camera1);
await register(a, doorLink, "Porta A");
let result = await readOnce(a, "a");
assert.equal(result.tone, "ok", result.text);
assert.match(result.text, /PODE ENTRAR[\s\S]*Nº 0001[\s\S]*Vendedor: João/);

const b = await phone(camera1);
await register(b, doorLink, "Porta B");
result = await readOnce(b, "b");
assert.equal(result.tone, "bad", result.text);
assert.match(result.text, /JÁ ENTROU[\s\S]*por Porta A/);
console.log("ok: online copy detected");

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

// 5. The painel report shows the door's work per seller (once E has uploaded its rejection).
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
await organizer.getByRole("tab", { name: "Relatório" }).click();
const total = organizer.locator("tr", { hasText: "Total" });
await total.waitFor({ timeout: TIMEOUT });
await organizer.screenshot({ path: join(OUT, "report.png"), fullPage: true });
// Tickets, unsold, lost, other voids, sold, entries, offline copies, blocked copies, voided entries.
const cells = (await total.locator("td").allInnerTexts()).slice(1, 10).map(Number);
assert.deepEqual(cells, [5, 0, 0, 0, 5, 2, 1, 2, 0]);
await painel.close();
console.log("ok: report counts the door");

for (const device of [a, b, c, d, e]) {
  await device.browser.close();
}
console.log("door e2e: all checks passed");
