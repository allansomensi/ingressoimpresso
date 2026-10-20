import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { placeLine } from "@/lib/calendar";
import { fetchPublicEvent, publicDate } from "@/lib/public-event";
import { SHARE_CONTENT_TYPE, SHARE_SIZE } from "@/lib/share-image";
import { SITE_URL } from "@/lib/site";
import { textOn } from "@/lib/ticket-pass";
import { brand as brandTexts } from "@/texts/pt-BR/brand";
import { meta as metaTexts } from "@/texts/pt-BR/meta";
import { publicEvent as publicEventTexts } from "@/texts/pt-BR/public-event";

export const size = SHARE_SIZE;
export const contentType = SHARE_CONTENT_TYPE;
export const alt = metaTexts.shareImageAlt;

// Each read names its folder, so only those files are traced into the server output.
function font(file: string): Promise<Buffer> {
  return readFile(join(process.cwd(), "node_modules", "geist", "dist", "fonts", "geist-sans", file));
}

async function logo(): Promise<string> {
  const bytes = await readFile(join(process.cwd(), "public", "brand", "logo-mark.svg"));
  return `data:image/svg+xml;base64,${bytes.toString("base64")}`;
}

/**
 * The share image of an event's page (ADR 0095): its name, date and place on the organization's
 * colour, signed by the product. Drawn when a link preview asks for it (the page is the
 * organizer's, not built with the site).
 */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const [event, regular, semibold, mark] = await Promise.all([
    params.then(({ slug }) => fetchPublicEvent(slug)),
    font("Geist-Regular.ttf"),
    font("Geist-SemiBold.ttf"),
    logo(),
  ]);
  const brand = event?.organization.brandColor ?? null;
  const background = brand !== null && textOn(brand) === "#ffffff" ? brand : "#5b3df5";
  const title = event?.name ?? publicEventTexts.notFoundTitle;
  const place = event === null ? null : placeLine(event.venue, event.address);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: background,
        backgroundImage: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.25) 100%)",
        fontFamily: "Geist",
        color: "#ffffff",
        padding: 64,
      }}
    >
      <span style={{ display: "flex", fontSize: 26, opacity: 0.9, letterSpacing: 3, textTransform: "uppercase" }}>
        {event === null ? brandTexts.name : event.organization.name}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <span style={{ fontSize: title.length > 40 ? 64 : 80, fontWeight: 600, lineHeight: 1.04, letterSpacing: -2 }}>{title}</span>
        {event !== null && <span style={{ fontSize: 34, opacity: 0.92 }}>{publicDate(event.startsAt)}</span>}
        {place !== null && <span style={{ fontSize: 28, opacity: 0.8 }}>{place.length > 70 ? `${place.slice(0, 68)}…` : place}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src={mark} width={44} height={44} alt="" />
          <span style={{ fontSize: 26, fontWeight: 600 }}>{brandTexts.name}</span>
        </div>
        {event?.soldOut === true ? (
          <span style={{ display: "flex", fontSize: 30, fontWeight: 600, padding: "6px 20px", border: "4px solid #ffffff", borderRadius: 14, letterSpacing: 4 }}>
            {publicEventTexts.soldOut.toUpperCase()}
          </span>
        ) : (
          <span style={{ fontSize: 24, opacity: 0.8 }}>{`${SITE_URL.replace(/^https?:\/\//, "")}/e/${event?.slug ?? ""}`}</span>
        )}
      </div>
    </div>,
    {
      ...SHARE_SIZE,
      fonts: [
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist", data: semibold, weight: 600, style: "normal" },
      ],
    },
  );
}
