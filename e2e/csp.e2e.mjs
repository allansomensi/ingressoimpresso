// Content Security Policy check (ADR 0048): every page of the production build answers with a
// nonce, every script the server writes carries it, and nothing the browser runs is refused.
// Run by e2e/run.sh after the door test, against the same `next start`.
import { chromium } from "playwright";

const WEB = process.env.E2E_WEB ?? "http://localhost:3000";
const PAGES = [
  "/",
  "/entrar",
  "/painel",
  "/painel/conta",
  "/painel/admin",
  "/painel/resultados",
  "/portaria",
  "/ingresso#token",
  "/status",
  "/novidades",
  "/termos",
  "/privacidade",
  "/reembolso",
  "/offline",
  "/nao-existe",
];

const browser = await chromium.launch();
let failures = 0;
for (const path of PAGES) {
  const page = await browser.newPage();
  const refused = [];
  page.on("console", (message) => {
    const text = message.text();
    // The analytics script only exists on Vercel: locally it is a 404 served as text, not CSP.
    if (/Content Security Policy|Refused to/.test(text) && !text.includes("_vercel/insights")) {
      refused.push(text);
    }
  });
  page.on("pageerror", (error) => refused.push(`page error: ${error.message}`));
  const response = await page.goto(`${WEB}${path}`, { waitUntil: "networkidle", timeout: 30_000 });
  const csp = response?.headers()["content-security-policy"] ?? "";
  const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(csp)?.[1];
  // Only the server's HTML is checked: scripts added later by nonce'd code are what
  // 'strict-dynamic' is for (lazy chunks, analytics, Google, Turnstile).
  const html = (await response?.text()) ?? "";
  const withoutNonce = (html.match(/<script(?![^>]*\bnonce=)[^>]*>/g) ?? []).filter(
    (tag) => !/type="application\/(?:json|ld\+json)"/.test(tag),
  );
  const ok = nonce !== undefined && csp.includes("'strict-dynamic'") && !/script-src[^;]*'unsafe-inline'/.test(csp) && refused.length === 0 && withoutNonce.length === 0;
  console.log(`${ok ? "ok" : "FAIL"}: ${path} (${response?.status() ?? "no response"})`);
  for (const line of [...refused, ...withoutNonce]) {
    console.log(`    ${line.slice(0, 200)}`);
  }
  if (!ok) {
    failures += 1;
  }
  await page.close();
}
await browser.close();
if (failures > 0) {
  console.error(`csp e2e: ${failures} page(s) failed`);
  process.exit(1);
}
console.log("csp e2e: every page carries its nonce and nothing was refused");
