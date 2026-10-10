/**
 * Version of this build (ADR 0049): the product's Semantic Versioning number, read from
 * package.json at build time (next.config.ts), and the commit it was built from.
 */
import { IS_STAGING } from "@/lib/site";

/** `1.4.0`; every manifest carries the same number (`scripts/release.mjs check`). */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

/** Short commit of the build; empty outside CI (`next dev`, local builds). */
export const APP_COMMIT = process.env.NEXT_PUBLIC_APP_COMMIT ?? "";

/** `v1.4.0`, plus the commit on staging, where several builds share a version. */
export const VERSION_LABEL = IS_STAGING && APP_COMMIT !== "" ? `v${APP_VERSION} · ${APP_COMMIT}` : `v${APP_VERSION}`;

/** Anchor of a release on /novidades (`v1.4.0`). */
export function versionAnchor(version: string): string {
  return `v${version}`;
}

/** Where this build's release notes are. */
export const RELEASE_NOTES_HREF = `/novidades#${versionAnchor(APP_VERSION)}`;

/**
 * A release number as tagged (`1.4.0`: no `v`, no leading zeros, up to six digits a part), the
 * rule of the API (`routes/changelog.rs`) and of `scripts/release.mjs`.
 */
export function isVersion(text: string): boolean {
  return /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(text);
}
