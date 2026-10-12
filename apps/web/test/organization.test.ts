import type { OrganizationProfileDto } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import { instagramUrl, profileBody, profileForm } from "@/lib/organization";

const profile: OrganizationProfileDto = {
  organizationName: "Banda Os Vizinhos",
  logo: null,
  brandColor: "#1a7f5a",
  whatsapp: "5511999998888",
  contactEmail: null,
  website: "https://osvizinhos.com.br",
  instagram: "os.vizinhos",
  defaultVenue: "Bar do Zé",
  defaultAddress: null,
  defaultTicketPriceCents: 2550,
};

describe("organization profile", () => {
  it("fills the form the way people type", () => {
    expect(profileForm(profile)).toEqual({
      brandColor: "#1a7f5a",
      whatsapp: "(11) 99999-8888",
      contactEmail: "",
      website: "https://osvizinhos.com.br",
      instagram: "@os.vizinhos",
      defaultVenue: "Bar do Zé",
      defaultAddress: "",
      defaultPrice: "25,50",
    });
  });

  it("sends blanks as null", () => {
    expect(profileBody({ ...profileForm(profile), contactEmail: "  ", defaultVenue: " Bar " }, null)).toEqual({
      brandColor: "#1a7f5a",
      whatsapp: "(11) 99999-8888",
      contactEmail: null,
      website: "https://osvizinhos.com.br",
      instagram: "@os.vizinhos",
      defaultVenue: "Bar",
      defaultAddress: null,
      defaultTicketPriceCents: null,
    });
  });

  it("links to Instagram", () => {
    expect(instagramUrl("@os.vizinhos")).toBe("https://www.instagram.com/os.vizinhos/");
  });
});
