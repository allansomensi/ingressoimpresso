/**
 * Share images of the public pages (Open Graph and Twitter, ADR 0062): the page's title on the
 * brand's purple, with the pictures of its templates (public/modelos). Built with next/og when the
 * site is built: the fonts and pictures are read from disk, so these routes must stay static.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { templateImagePath, type TemplateSeoPage } from "@/content/seo-templates";
import { templateImageSize } from "@/lib/templates/images";
import { SITE_URL } from "@/lib/site";
import { texts } from "@/texts/pt-BR";

export const SHARE_SIZE = { width: 1200, height: 630 };
export const SHARE_CONTENT_TYPE = "image/png";

// Each read names its folder, so only those files are traced into the server output.
function font(file: string): Promise<Buffer> {
  return readFile(join(process.cwd(), "node_modules", "geist", "dist", "fonts", "geist-sans", file));
}

async function logo(): Promise<string> {
  const bytes = await readFile(join(process.cwd(), "public", "brand", "logo-mark.svg"));
  return `data:image/svg+xml;base64,${bytes.toString("base64")}`;
}

/** Up to three template pictures, fanned out on the right. */
async function pictures(templates: readonly TemplateSeoPage[]) {
  return Promise.all(
    templates.slice(0, 3).map(async (page) => {
      const file = templateImagePath(page).split("/").pop() ?? "";
      const bytes = await readFile(join(process.cwd(), "public", "modelos", file));
      return { src: `data:image/jpeg;base64,${bytes.toString("base64")}`, ...templateImageSize(page.id) };
    }),
  );
}

/** Fits a picture in a box, keeping its proportions. */
function fit(size: { width: number; height: number }, box: { width: number; height: number }) {
  const scale = Math.min(box.width / size.width, box.height / size.height);
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
}

export async function shareImage({ eyebrow, title, templates }: { eyebrow: string; title: string; templates: readonly TemplateSeoPage[] }) {
  const [regular, semibold, mark, shown] = await Promise.all([font("Geist-Regular.ttf"), font("Geist-SemiBold.ttf"), logo(), pictures(templates)]);
  // One picture large; two or three overlapping, the first in front.
  // The right column is 488 × 502 px.
  const box = shown.length === 1 ? { width: 480, height: 430 } : { width: 390, height: 300 };
  const angles = [-5, 4, -1];
  const offsets = [
    { top: 30, left: 0 },
    { top: 190, left: 50 },
    { top: 110, left: 96 },
  ];
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        backgroundColor: "#5b3df5",
        backgroundImage: "linear-gradient(135deg, #7b5cff 0%, #5b3df5 45%, #3a1fc4 100%)",
        fontFamily: "Geist",
        color: "#ffffff",
        padding: 64,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: shown.length === 0 ? 1072 : 560 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- next/og draws plain <img> */}
          <img src={mark} width={52} height={52} alt="" />
          <span style={{ fontSize: 30, fontWeight: 600 }}>{texts.brand.name}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span
            style={{
              display: "flex",
              alignSelf: "flex-start",
              fontSize: 24,
              padding: "8px 18px",
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.16)",
              border: "1px solid rgba(255,255,255,0.28)",
            }}
          >
            {eyebrow}
          </span>
          <span style={{ fontSize: title.length > 48 ? 54 : 62, fontWeight: 600, lineHeight: 1.08, letterSpacing: -1.5 }}>{title}</span>
        </div>
        <span style={{ fontSize: 24, opacity: 0.8 }}>{SITE_URL.replace(/^https?:\/\//, "")}</span>
      </div>
      {shown.length > 0 && (
        <div style={{ display: "flex", position: "relative", flex: 1, marginLeft: 24 }}>
          {shown
            .map((picture, index) => ({ picture, index, size: fit(picture, box) }))
            .reverse()
            .map(({ picture, index, size }) => (
              // eslint-disable-next-line @next/next/no-img-element -- next/og draws plain <img>
              <img
                key={index}
                src={picture.src}
                width={size.width}
                height={size.height}
                alt=""
                style={{
                  position: "absolute",
                  top: shown.length === 1 ? (502 - size.height) / 2 : (offsets[index]?.top ?? 0),
                  left: shown.length === 1 ? (488 - size.width) / 2 : (offsets[index]?.left ?? 0),
                  transform: `rotate(${String(angles[index] ?? 0)}deg)`,
                  borderRadius: 6,
                  boxShadow: "0 24px 60px rgba(10, 4, 60, 0.45)",
                }}
              />
            ))}
        </div>
      )}
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
