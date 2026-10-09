/** Turns a template's SVG background into the JPEG art the server prints (ADR 0025). */

import { BLEED_MM } from "@/lib/design-rules";

const MM_PER_INCH = 25.4;
/** Print resolution of template art. */
export const TEMPLATE_DPI = 300;

/** A data URL of an SVG, for `<img>`. */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Rasterizes a background covering `width × height` mm plus bleed as a JPEG at `dpi`. */
export async function rasterizeBackground(svg: string, width: number, height: number, dpi = TEMPLATE_DPI): Promise<Blob> {
  const widthPx = Math.round(((width + 2 * BLEED_MM) / MM_PER_INCH) * dpi);
  const heightPx = Math.round(((height + 2 * BLEED_MM) / MM_PER_INCH) * dpi);
  const image = new Image();
  image.src = svgDataUrl(svg);
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("canvas 2d unavailable");
  }
  context.drawImage(image, 0, 0, widthPx, heightPx);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          reject(new Error("could not encode the art"));
        } else {
          resolve(blob);
        }
      },
      "image/jpeg",
      0.92,
    );
  });
}
