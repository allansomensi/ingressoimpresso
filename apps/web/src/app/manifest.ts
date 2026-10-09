import type { MetadataRoute } from "next";

import { texts } from "@/texts/pt-BR";

/** Manifest of the panel (ADR 0021). The door has its own, scoped to /portaria (ADR 0018). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: texts.meta.title,
    short_name: texts.meta.title,
    description: texts.meta.description,
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/painel",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f7f9",
    theme_color: "#5b3df5",
    categories: ["business", "productivity", "events"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: texts.panel.title, url: "/painel", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: texts.portaria.title, url: "/portaria", icons: [{ src: "/portaria-icon-192.png", sizes: "192x192" }] },
    ],
  };
}
