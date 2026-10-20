/**
 * The sample picture of a ticket: the server's image of one SAMPLE ticket (invalid QR, watermark),
 * laid on a soft background with a shadow and a slight tilt, the way a printed ticket looks on a
 * table. Drawn in the browser, so sharing it costs the API nothing more.
 *
 * Under the ticket goes the product's signature (logo, name and address): a picture forwarded in
 * a group chat tells whoever sees it where tickets like that come from.
 */

import { SITE_URL } from "@/lib/site";
import { brand as brandTexts } from "@/texts/pt-BR/brand";

/** Room around the ticket, as a share of its width. */
const MARGIN = 0.1;
/** Tilt of the ticket, in degrees. */
const TILT = -2.5;
/** Height of the signature's line, as a share of the ticket's width (at least 22 px). */
const SIGNATURE = 0.032;
/**
 * The logo mark (public/brand/logo-mark.svg) with a size of its own: some browsers refuse to draw
 * an SVG without one on a canvas.
 */
const LOGO_URL = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><linearGradient id="ii-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7B5CFF"/><stop offset="1" stop-color="#4A22D6"/></linearGradient></defs><g transform="rotate(-12 32 32)"><path d="M10 14h44a6 6 0 0 1 6 6v6.5a5.5 5.5 0 0 0 0 11V44a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6v-6.5a5.5 5.5 0 0 0 0-11V20a6 6 0 0 1 6-6z" fill="url(#ii-g)"/><path d="M45 20v3.2M45 26.9v3.2M45 33.8v3.2M45 40.7v3.2" stroke="#fff" stroke-opacity=".55" stroke-width="2.4" stroke-linecap="round"/><path d="M18 32.5l5.5 5.5 12-12" fill="none" stroke="#fff" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/></g></svg>')}`;

/** A file name for the picture: "amostra-festa-junina.png". */
export function sampleFileName(eventName: string): string {
  const slug = eventName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `amostra${slug === "" ? "" : `-${slug}`}.png`;
}

/** The address without the scheme: "ingressoimpresso.com.br". */
function siteHost(): string {
  return SITE_URL.replace(/^https?:\/\//, "");
}

async function loadLogo(): Promise<HTMLImageElement | null> {
  const logo = new Image();
  logo.decoding = "async";
  logo.src = LOGO_URL;
  try {
    await logo.decode();
    return logo;
  } catch {
    // Without the mark the name still signs the picture.
    return null;
  }
}

/** Logo, "Ingresso Impresso" and the address on one line, centred on `centerY`. */
async function drawSignature(context: CanvasRenderingContext2D, width: number, centerY: number, line: number): Promise<void> {
  const logo = await loadLogo();
  const family = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  const nameFont = `600 ${String(Math.round(line * 0.62))}px ${family}`;
  const hostFont = `400 ${String(Math.round(line * 0.52))}px ${family}`;
  const name = brandTexts.name;
  const host = ` · ${siteHost()}`;
  const gap = Math.round(line * 0.3);
  context.font = nameFont;
  const nameWidth = context.measureText(name).width;
  context.font = hostFont;
  const hostWidth = context.measureText(host).width;
  const logoWidth = logo === null ? 0 : line + gap;
  let x = (width - (logoWidth + nameWidth + hostWidth)) / 2;
  if (logo !== null) {
    context.drawImage(logo, x, centerY - line / 2, line, line);
    x += logoWidth;
  }
  context.textBaseline = "middle";
  context.font = nameFont;
  context.fillStyle = "#1f2433";
  context.fillText(name, x, centerY);
  context.font = hostFont;
  context.fillStyle = "#5b6275";
  context.fillText(host, x + nameWidth, centerY);
}

/** The picture as a PNG: the ticket image on a light backdrop. */
export async function sampleMockup(ticket: Blob): Promise<Blob> {
  const image = await createImageBitmap(ticket);
  const margin = Math.round(image.width * MARGIN);
  const line = Math.max(22, Math.round(image.width * SIGNATURE));
  // The signature sits in a strip under the bottom margin.
  const footer = Math.round(line * 2.2);
  const canvas = document.createElement("canvas");
  canvas.width = image.width + 2 * margin;
  canvas.height = image.height + 2 * margin + footer;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("no canvas");
  }
  // A cool grey backdrop with a light from the top left (the same in both themes: it is a picture).
  const light = context.createRadialGradient(canvas.width * 0.25, 0, 0, canvas.width * 0.25, 0, canvas.width);
  light.addColorStop(0, "#f7f8fa");
  light.addColorStop(1, "#dcdfe6");
  context.fillStyle = light;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.save();
  context.translate(canvas.width / 2, margin + image.height / 2);
  context.rotate((TILT * Math.PI) / 180);
  const x = -image.width / 2;
  const y = -image.height / 2;
  // Paper lifting off the table: a wide soft shadow and a short dark one.
  context.shadowColor = "rgba(15, 23, 42, 0.22)";
  context.shadowBlur = image.width * 0.04;
  context.shadowOffsetY = image.width * 0.018;
  context.fillStyle = "#ffffff";
  context.fillRect(x, y, image.width, image.height);
  context.shadowColor = "rgba(15, 23, 42, 0.18)";
  context.shadowBlur = image.width * 0.004;
  context.shadowOffsetY = image.width * 0.002;
  context.fillRect(x, y, image.width, image.height);
  context.shadowColor = "transparent";
  context.drawImage(image, x, y);
  image.close();
  context.restore();
  await drawSignature(context, canvas.width, canvas.height - footer / 2 - margin * 0.35, line);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error("no picture"));
      } else {
        resolve(blob);
      }
    }, "image/png");
  });
}
