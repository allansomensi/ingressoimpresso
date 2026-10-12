// End-to-end test of the seller's link without internet (ADR 0074), against the real API and the
// production web build (the service worker only runs there). One phone opens the link, loses the
// signal, reopens the page from the service worker with the last data, marks a sale and a
// reservation offline; meanwhile "another phone" sells the same number. When the signal comes back
// the queue is sent once, the reservation arrives and the conflict is explained in plain words.
// The link's token never lands in the phone's storage nor in the API's log.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { chromium } from "playwright";

const API = process.env.E2E_API ?? "http://localhost:8080";
const API_LOG = process.env.E2E_API_LOG ?? "target/e2e/api.log";
const OUT = resolve(process.env.E2E_OUT ?? "target/e2e");
const EMAIL = `seller-${process.env.E2E_EMAIL ?? "e2e@exemplo.com"}`;
const TIMEOUT = 20_000;

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
  return response.status === 204 ? null : response.json();
}

async function until(what, check, timeoutMs = 30_000) {
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
    return /development mailer[^\n]*?subject\S*?=\S*?[^\d\n]*(\d{6})/.exec(log)?.[1];
  });
  return (await api("/api/auth/verify", { body: { email: EMAIL, code } })).token;
}

const token = await login();
const event = await api("/api/events", {
  token,
  body: {
    name: "Rifa da formatura",
    startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    endsAt: new Date(Date.now() + 7 * 86_400_000 + 4 * 3_600_000).toISOString(),
    ticketPriceCents: 1000,
  },
});
const batch = await api(`/api/events/${event.id}/batches`, { token, body: { quantity: 10 } });
if (batch.status !== "paid") {
  // The door test's account is the admin (with two steps): it pays this batch by hand.
  throw new Error(`the seller test needs free tickets for a batch of 10 (status ${batch.status})`);
}
const seller = await api(`/api/events/${event.id}/sellers`, { token, body: { name: "Maria Souza" } });
await api(`/api/sellers/${seller.id}/ranges`, { token, body: { first: 1, last: 10 } });
const link = (await api(`/api/sellers/${seller.id}/link`, { token, body: {} })).url;
const secret = link.split("#")[1];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "pt-BR" });
const page = await context.newPage();
page.on("pageerror", (error) => console.error("page error:", error.message));

// 1. Online: the page opens and the service worker takes control (it keeps /vendedor).
await page.goto(link);
await page.getByText("Olá, Maria!").waitFor({ timeout: TIMEOUT });
await page.evaluate(async () => {
  await navigator.serviceWorker.ready;
});
await until("the worker to keep the seller's page", () =>
  page.evaluate(async () => (await caches.keys()).some((key) => key.startsWith("app-")) && (await caches.match("/vendedor")) !== undefined),
);

// 2. No signal: the page reopens from the phone, with the last data.
await context.setOffline(true);
await page.reload();
await page.getByText("Olá, Maria!").waitFor({ timeout: TIMEOUT });
await page.getByText(/Sem internet/).waitFor({ timeout: TIMEOUT });
await page.screenshot({ path: join(OUT, "seller-offline-reopened.png") });

// 3. A sale (3 to Ana) and a reservation (4 for Bia) offline.
await page.getByRole("button", { name: /^0003 ·/ }).click();
await page.getByLabel("Nome").fill("Ana");
await page.getByRole("button", { name: "Marcar 1 como vendido" }).click();
await page.getByRole("button", { name: "Reservar", exact: true }).click();
await page.getByLabel("Número reservado").fill("4");
await page.getByLabel("Nome").fill("Bia");
await page.getByRole("button", { name: "Reservar 1 número" }).click();
await page.getByText("Sem internet · 2 alterações para enviar").waitFor({ timeout: TIMEOUT });
await page.screenshot({ path: join(OUT, "seller-offline-queue.png") });

// Meanwhile another phone of the same seller sells 3 to Caio.
await api("/api/seller/sync", {
  body: {
    token: secret,
    ops: [{ id: crypto.randomUUID(), op: { kind: "mark", ranges: [{ first: 3, last: 3 }], buyerName: "Caio", buyerPhone: null, edit: false, reservationId: null } }],
  },
});

// 4. The signal comes back: the queue goes, the conflict is explained, nothing is doubled.
await context.setOffline(false);
await page.getByText("Algumas alterações não foram feitas").waitFor({ timeout: TIMEOUT });
await page.getByText("O 0003 já tinha sido marcado como vendido em outro aparelho (para Caio). Ficou como estava.").waitFor();
await page.screenshot({ path: join(OUT, "seller-offline-conflict.png") });
await page.getByRole("button", { name: "Entendi" }).click();
const view = await api("/api/seller", { body: { token: secret } });
assert.deepEqual(
  view.sales.map((sale) => [sale.number, sale.buyerName]),
  [[3, "Caio"]],
  "the sale kept is the other phone's",
);
assert.equal(view.reservations.length, 1);
assert.equal(view.reservations[0].holderName, "Bia");
assert.deepEqual(view.reservations[0].numbers, [{ first: 4, last: 4 }]);
await until("the queue to be empty", async () => (await page.getByText(/alterações? para enviar/).count()) === 0);

// 5. The token stays in the fragment: not in the phone's storage, not in the API's log.
const stored = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
assert.ok(stored.includes("ingressoimpresso.seller."), "the last view is kept on the phone");
assert.ok(!stored.includes(secret), "the token is not stored");
assert.ok(!readFileSync(API_LOG, "utf8").includes(secret), "the token never reaches the API log");

await browser.close();
console.log("seller e2e: offline queue, reopening offline, conflicts and privacy ok");
