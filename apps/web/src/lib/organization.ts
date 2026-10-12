/** The organization's public profile (ADR 0064): links and what the profile form sends. */

import type { OrganizationProfileBody, OrganizationProfileDto } from "@ingressoimpresso/api-types";

import { displayPhone } from "@/lib/event-change";

/** The profile page of an Instagram handle. */
export function instagramUrl(handle: string): string {
  return `https://www.instagram.com/${encodeURIComponent(handle.replace(/^@/, ""))}/`;
}

/** The profile form's fields, as typed. */
export interface ProfileForm {
  brandColor: string;
  whatsapp: string;
  contactEmail: string;
  website: string;
  instagram: string;
  defaultVenue: string;
  defaultAddress: string;
  defaultPrice: string;
}

/** The form filled from the saved profile (the phone as people write it). */
export function profileForm(profile: OrganizationProfileDto): ProfileForm {
  return {
    brandColor: profile.brandColor ?? "",
    whatsapp: profile.whatsapp === null ? "" : displayPhone(profile.whatsapp),
    contactEmail: profile.contactEmail ?? "",
    website: profile.website ?? "",
    instagram: profile.instagram === null ? "" : `@${profile.instagram}`,
    defaultVenue: profile.defaultVenue ?? "",
    defaultAddress: profile.defaultAddress ?? "",
    defaultPrice: profile.defaultTicketPriceCents === null ? "" : (profile.defaultTicketPriceCents / 100).toFixed(2).replace(".", ","),
  };
}

const blank = (value: string) => (value.trim() === "" ? null : value.trim());

/** What `PUT /api/account/profile` receives; the server normalizes and checks every field. */
export function profileBody(form: ProfileForm, priceCents: number | null): OrganizationProfileBody {
  return {
    brandColor: blank(form.brandColor),
    whatsapp: blank(form.whatsapp),
    contactEmail: blank(form.contactEmail),
    website: blank(form.website),
    instagram: blank(form.instagram),
    defaultVenue: blank(form.defaultVenue),
    defaultAddress: blank(form.defaultAddress),
    defaultTicketPriceCents: priceCents,
  };
}
