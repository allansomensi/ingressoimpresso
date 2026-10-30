/**
 * How the event's public page looks (ADR 0125): the colours, the top and the order of the parts,
 * shared by `/e/<slug>` and the editor's live preview, and the checks the API makes, so the
 * editor points at a mistake before saving.
 */
import type { PageLinkDto, PageSection, PageSectionDto, PublicOrganizationDto, PublicPageDesign } from "@ingressoimpresso/api-types";

import { textOn } from "@/lib/ticket-pass";

export const MAX_SCHEDULE = 30;
export const MAX_FAQ = 15;
export const MAX_LINKS = 8;
export const MAX_LINK_LABEL = 40;
export const MAX_SCHEDULE_TIME = 20;
export const MAX_SCHEDULE_TITLE = 80;
export const MAX_SCHEDULE_DETAIL = 160;
export const MAX_QUESTION = 140;
export const MAX_ANSWER = 600;

/** Every part of the page, in the order a new page shows them (the server's default). */
export const PAGE_SECTIONS: readonly PageSection[] = ["prices", "waitlist", "buy", "schedule", "days", "where", "about", "faq", "links", "verify"];

/** Accent colours offered in the editor: strong enough for white text, apart from each other. */
export const PAGE_ACCENTS: readonly string[] = [
  "#5b3df5",
  "#2563eb",
  "#0e7490",
  "#047857",
  "#4d7c0f",
  "#b45309",
  "#c2410c",
  "#be123c",
  "#a21caf",
  "#7c2d12",
  "#1f2937",
  "#0f172a",
];

/** A design as the server makes for a page never edited. */
export function defaultPageDesign(): PublicPageDesign {
  return {
    accent: null,
    background: "plain",
    hero: "color",
    titleFont: null,
    cta: null,
    sections: PAGE_SECTIONS.map((kind) => ({ kind, visible: true })),
    schedule: [],
    faq: [],
    links: [],
  };
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

/**
 * The page's accent: the one chosen, else the organization's colour when white text reads on
 * it (the hero writes in white), else `null` for the product's.
 */
export function pageAccent(design: Pick<PublicPageDesign, "accent">, organization: Pick<PublicOrganizationDto, "brandColor">): string | null {
  if (design.accent !== null && isHexColor(design.accent)) {
    return design.accent.toLowerCase();
  }
  const brand = organization.brandColor;
  return brand !== null && isHexColor(brand) && textOn(brand) === "#ffffff" ? brand : null;
}

/** Ink on the accent: white, or near-black on a light colour. */
export function accentInk(accent: string | null): "#0e0d14" | "#ffffff" {
  return accent === null ? "#ffffff" : textOn(accent);
}

/** The CSS colour of the accent (the product's own when there is none). */
export function accentCss(accent: string | null): string {
  return accent ?? "var(--brand-solid)";
}

/**
 * The top of the page: background and ink. A cover darkens toward the bottom, where the text
 * sits, whatever the photo; a gradient deepens the accent (or lightens a light one).
 */
export function heroLook(design: Pick<PublicPageDesign, "hero">, accent: string | null, coverUrl: string | null): { background: string; ink: string } {
  const base = accentCss(accent);
  if (design.hero === "cover" && coverUrl !== null) {
    return {
      background: `linear-gradient(180deg, rgb(0 0 0 / 0.3) 0%, rgb(0 0 0 / 0.55) 45%, rgb(0 0 0 / 0.86) 100%), url("${coverUrl}") center / cover no-repeat, ${base}`,
      ink: "#ffffff",
    };
  }
  const ink = accentInk(accent);
  if (design.hero === "gradient") {
    const toward = ink === "#ffffff" ? "black" : "white";
    return {
      background: `radial-gradient(120% 90% at 100% 0%, color-mix(in oklab, ${base} 70%, white) 0%, transparent 55%), linear-gradient(150deg, ${base} 0%, color-mix(in oklab, ${base} 62%, ${toward}) 100%)`,
      ink,
    };
  }
  return { background: base, ink };
}

/** The page's background, under the parts (the dark one switches the theme of the page). */
export function pageBackground(design: Pick<PublicPageDesign, "background">, accent: string | null): string | undefined {
  return design.background === "tinted" ? `color-mix(in oklab, ${accentCss(accent)} 9%, var(--bg))` : undefined;
}

/** The parts to show, in order. */
export function shownSections(design: Pick<PublicPageDesign, "sections">): PageSection[] {
  const seen = new Set<PageSection>();
  const order: PageSection[] = [];
  for (const section of design.sections) {
    if (!seen.has(section.kind)) {
      seen.add(section.kind);
      if (section.visible) {
        order.push(section.kind);
      }
    }
  }
  // An older saved design may lack a part added later: it shows at the end, like on the server.
  for (const kind of PAGE_SECTIONS) {
    if (!seen.has(kind)) {
      order.push(kind);
    }
  }
  return order;
}

/** Every part once, the ones a design lacks at the end. */
export function everySection(sections: readonly PageSectionDto[]): PageSectionDto[] {
  const seen = new Set<PageSection>();
  const all: PageSectionDto[] = [];
  for (const section of sections) {
    if (!seen.has(section.kind)) {
      seen.add(section.kind);
      all.push(section);
    }
  }
  return [...all, ...PAGE_SECTIONS.filter((kind) => !seen.has(kind)).map((kind) => ({ kind, visible: true }))];
}

/** Moves the part at `index` by `delta` places (out of the list: nothing changes). */
export function moveSection(sections: readonly PageSectionDto[], index: number, delta: number): PageSectionDto[] {
  const target = index + delta;
  const moving = sections[index];
  if (moving === undefined || target < 0 || target >= sections.length) {
    return [...sections];
  }
  const next = sections.filter((_, position) => position !== index);
  next.splice(target, 0, moving);
  return next;
}

/** A link as the API keeps it: `https://` added when missing; `null` when it is not an address. */
export function normalizeLink(text: string): string | null {
  const value = text.trim();
  if (value === "" || value.length > 200 || /\s/.test(value)) {
    return null;
  }
  const lower = value.toLowerCase();
  if (!lower.startsWith("https://") && !lower.startsWith("http://") && lower.includes("://")) {
    return null;
  }
  const url = lower.startsWith("https://") || lower.startsWith("http://") ? value : `https://${value}`;
  const host = url.split("://")[1]?.split(/[/?#]/)[0] ?? "";
  return host.includes(".") && !host.startsWith(".") && !host.endsWith(".") ? url : null;
}

/** What the editor flags before saving, by place. */
export interface PageDesignIssues {
  cta: boolean;
  links: Set<number>;
  schedule: Set<number>;
  faq: Set<number>;
}

function linkInvalid(link: PageLinkDto): boolean {
  const label = link.label.trim();
  return label === "" || label.length > MAX_LINK_LABEL || normalizeLink(link.url) === null;
}

export function pageDesignIssues(design: PublicPageDesign): PageDesignIssues {
  const issues: PageDesignIssues = { cta: false, links: new Set(), schedule: new Set(), faq: new Set() };
  issues.cta = design.cta !== null && linkInvalid(design.cta);
  design.links.forEach((link, index) => {
    if (linkInvalid(link)) {
      issues.links.add(index);
    }
  });
  design.schedule.forEach((item, index) => {
    const title = item.title.trim();
    if (title === "" || title.length > MAX_SCHEDULE_TITLE || item.time.trim().length > MAX_SCHEDULE_TIME || (item.detail ?? "").trim().length > MAX_SCHEDULE_DETAIL) {
      issues.schedule.add(index);
    }
  });
  design.faq.forEach((item, index) => {
    const question = item.question.trim();
    const answer = item.answer.trim();
    if (question === "" || question.length > MAX_QUESTION || answer === "" || answer.length > MAX_ANSWER) {
      issues.faq.add(index);
    }
  });
  return issues;
}

export function hasIssues(issues: PageDesignIssues): boolean {
  return issues.cta || issues.links.size > 0 || issues.schedule.size > 0 || issues.faq.size > 0;
}

/** The design to send: trimmed, empty details dropped, links with their `https://`. */
export function designBody(design: PublicPageDesign): PublicPageDesign {
  const link = (item: PageLinkDto): PageLinkDto => ({ label: item.label.trim(), url: normalizeLink(item.url) ?? item.url.trim() });
  return {
    ...design,
    accent: design.accent?.toLowerCase() ?? null,
    cta: design.cta === null ? null : link(design.cta),
    links: design.links.map(link),
    schedule: design.schedule.map((item) => {
      const detail = (item.detail ?? "").trim();
      return { time: item.time.trim(), title: item.title.trim(), detail: detail === "" ? null : detail };
    }),
    faq: design.faq.map((item) => ({ question: item.question.trim(), answer: item.answer.trim() })),
  };
}
