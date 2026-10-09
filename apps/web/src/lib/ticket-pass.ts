/**
 * Digital tickets on the holder's phone (ADR 0030): the copy kept in this browser so the ticket
 * opens without internet at the door, and the image saved to the gallery.
 */
import type { TicketPassDto } from "@ingressoimpresso/api-types";
import { encode } from "uqr";

import { wallClockDate } from "@/lib/event-time";

const STORE_KEY = "ingressoimpresso.tickets";
/** Tickets kept per browser (the oldest go first). */
const MAX_STORED = 20;

type Stored = Record<string, { pass: TicketPassDto; savedAt: number }>;

function readStore(): Stored {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const parsed: unknown = raw === null ? {} : JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Stored) : {};
  } catch {
    return {};
  }
}

/** The ticket saved for `token`, if this browser opened it before. */
export function storedPass(token: string): TicketPassDto | null {
  return readStore()[token]?.pass ?? null;
}

/** Keeps the latest version of a ticket (and drops the oldest beyond the limit). */
export function storePass(token: string, pass: TicketPassDto): void {
  try {
    const store = readStore();
    store[token] = { pass, savedAt: Date.now() };
    const kept = Object.entries(store)
      .sort(([, a], [, b]) => b.savedAt - a.savedAt)
      .slice(0, MAX_STORED);
    window.localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Storage full or blocked: the ticket still shows, it just will not open offline.
  }
}

/** Forgets a ticket whose link was revoked. */
export function forgetPass(token: string): void {
  try {
    const store = readStore();
    if (token in store) {
      window.localStorage.setItem(
        STORE_KEY,
        JSON.stringify(Object.fromEntries(Object.entries(store).filter(([key]) => key !== token))),
      );
    }
  } catch {
    // Nothing to forget.
  }
}

/** `sexta-feira, 20 de novembro de 2026 · 22:00`, in the event's own wall-clock time. */
export function passDate(iso: string): string {
  const date = wallClockDate(iso);
  const day = date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${day} · ${time}`;
}

/** Black or white, whichever reads better on `hex` (WCAG relative luminance). */
export function textOn(hex: string): "#0e0d14" | "#ffffff" {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (match === null) {
    return "#0e0d14";
  }
  const value = Number.parseInt(match[1] ?? "000000", 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 0xff) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  return luminance > 0.4 ? "#0e0d14" : "#ffffff";
}

/** The header colour of a digital ticket: the design's background, or the brand's when that is near white. */
export function passBand(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    return "#5b3df5";
  }
  const value = Number.parseInt(hex.slice(1), 16);
  const lightest = Math.min((value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
  return lightest > 225 ? "#5b3df5" : hex;
}

/** Lines of `text` that fit `width` on the canvas, at most `max` (the last one ends in "…"). */
function wrap(context: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line === "" ? word : `${line} ${word}`;
    if (context.measureText(next).width <= width || line === "") {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== "") {
    lines.push(line);
  }
  if (lines.length > max) {
    const kept = lines.slice(0, max);
    let last = kept[max - 1] ?? "";
    while (last.length > 1 && context.measureText(`${last}…`).width > width) {
      last = last.slice(0, -1);
    }
    kept[max - 1] = `${last}…`;
    return kept;
  }
  return lines;
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/**
 * The ticket as a PNG for the gallery: the event, a large QR on white and the number. Drawn in
 * the browser, so it works offline and never leaves the phone.
 */
export async function passImage(pass: TicketPassDto, labels: { ticket: string; show: string; site: string }): Promise<Blob> {
  const width = 1080;
  const height = 1680;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("canvas unavailable");
  }
  const band = passBand(pass.backgroundColor);
  const ink = textOn(band);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = band;
  context.fillRect(0, 0, width, 470);

  context.fillStyle = ink;
  context.globalAlpha = 0.75;
  context.font = `600 34px ${FONT}`;
  context.fillText(labels.ticket, 80, 110);
  context.globalAlpha = 1;
  context.font = `700 72px ${FONT}`;
  const title = wrap(context, pass.event.name, width - 160, 2);
  title.forEach((line, index) => {
    context.fillText(line, 80, 200 + index * 84);
  });
  context.font = `500 36px ${FONT}`;
  context.globalAlpha = 0.85;
  const details = [passDate(pass.event.startsAt), pass.event.venue ?? ""].filter((line) => line !== "");
  details.forEach((line, index) => {
    const [fitted = line] = wrap(context, line, width - 160, 1);
    context.fillText(fitted, 80, 200 + title.length * 84 + 24 + index * 48);
  });
  context.globalAlpha = 1;

  if (pass.qrText !== null) {
    const qr = encode(pass.qrText, { ecc: "M", border: 4 });
    const box = 800;
    const cell = Math.floor(box / qr.size);
    const size = cell * qr.size;
    const left = Math.round((width - size) / 2);
    const top = 520;
    context.fillStyle = "#ffffff";
    context.fillRect(left, top, size, size);
    context.fillStyle = "#000000";
    qr.data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) {
          context.fillRect(left + x * cell, top + y * cell, cell, cell);
        }
      });
    });
  }

  context.fillStyle = "#0e0d14";
  context.textAlign = "center";
  context.font = `700 88px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
  context.fillText(`${pass.numberPrefix.trim() === "" ? "Nº" : pass.numberPrefix.trim()} ${pass.numberLabel}`, width / 2, 1440);
  if (pass.holderName !== null) {
    context.font = `500 40px ${FONT}`;
    context.fillStyle = "#5b5a6b";
    const [holder = pass.holderName] = wrap(context, pass.holderName, width - 160, 1);
    context.fillText(holder, width / 2, 1500);
  }
  context.font = `500 32px ${FONT}`;
  context.fillStyle = "#6b6a7d";
  context.fillText(labels.show, width / 2, 1590);
  context.font = `500 26px ${FONT}`;
  context.fillText(labels.site, width / 2, 1636);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error("image encoding failed"));
      } else {
        resolve(blob);
      }
    }, "image/png");
  });
}

/** Saves an image: the share sheet on phones that can share files (iOS "Salvar imagem"), a download elsewhere. */
export async function saveImage(blob: Blob, fileName: string): Promise<void> {
  const file = new File([blob], fileName, { type: blob.type });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}
