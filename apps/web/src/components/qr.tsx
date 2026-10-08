"use client";

import { encode } from "uqr";

/** A QR code drawn as one SVG path (crisp at any size, no image data). */
export function QrCode({ text, size = 192, label }: { text: string; size?: number; label: string }) {
  const qr = encode(text, { ecc: "M", border: 4 });
  let path = "";
  qr.data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) {
        path += `M${String(x)} ${String(y)}h1v1h-1z`;
      }
    });
  });
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${String(qr.size)} ${String(qr.size)}`}
      shapeRendering="crispEdges"
      className="rounded-md bg-white"
    >
      <path d={path} fill="#000" />
    </svg>
  );
}
