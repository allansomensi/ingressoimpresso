// Captures the picture of every ticket template (ADR 0062) from the running site: each
// /modelos/<slug> page draws its template filled with the sample event, and the element marked
// `data-template-capture` (the live sample, rendered by the page only with `?captura=1`) is saved
// as apps/web/public/modelos/<slug>.jpg, 1200 px wide.
// Usage: `just web-dev` (or `next start`) in another terminal, then `just template-images`.
// WEB sets the site (default http://localhost:3000); CHROMIUM_PATH, a Chromium to use; ONLY, the
// slugs to capture (comma-separated), so a new template leaves the other pictures untouched.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const WEB = process.env.WEB ?? "http://localhost:3000";
const WIDTH = 1200;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", "public", "modelos");

const sitemap = await (await fetch(`${WEB}/sitemap.xml`)).text();
const only = (process.env.ONLY ?? "").split(",").map((slug) => slug.trim()).filter((slug) => slug !== "");
const slugs = [...sitemap.matchAll(/<loc>[^<]*\/modelos\/([a-z0-9-]+)<\/loc>/g)]
  .map((match) => match[1])
  .filter((slug) => only.length === 0 || only.includes(slug));
if (slugs.length === 0) {
  console.error(`no /modelos/<slug> in ${WEB}/sitemap.xml: is the site running?`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const slug of slugs) {
  // First a look at the element's width, then a page whose pixel ratio makes it WIDTH pixels wide.
  const probe = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await probe.goto(`${WEB}/modelos/${slug}?captura=1`, { waitUntil: "load", timeout: 90_000 });
  await probe.evaluate(() => document.fonts.ready);
  const width = await probe.locator("[data-template-capture]").evaluate((element) => element.getBoundingClientRect().width);
  await probe.close();

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: WIDTH / width, colorScheme: "light" });
  const page = await context.newPage();
  await page.goto(`${WEB}/modelos/${slug}?captura=1`, { waitUntil: "load", timeout: 90_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const target = page.locator("[data-template-capture]");
  // Without the page's rounded corners and shadow: the picture is the ticket itself.
  await target.evaluate((element) => {
    element.style.borderRadius = "0";
    element.style.boxShadow = "none";
  });
  await target.screenshot({ path: join(OUT, `${slug}.jpg`), type: "jpeg", quality: 85 });
  await context.close();
  console.log(`ok: ${slug}.jpg`);
}
await browser.close();
