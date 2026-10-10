import { describe, expect, it } from "vitest";

import { ApiError, isUuid, safePath } from "@/lib/api";

describe("safePath", () => {
  it("accepts the paths the panel writes", () => {
    for (const path of [
      "/api/me",
      "/api/events/8f1d6a52-3c1e-4b6f-9a2d-6c0e5b7a9d01/batches",
      "/api/admin/audit?q=lote&page=2",
      "/api/batches/8f1d6a52-3c1e-4b6f-9a2d-6c0e5b7a9d01/checkout/sync",
    ]) {
      expect(safePath(path)).toBe(path);
    }
  });

  it("refuses a path that could reach another endpoint", () => {
    for (const path of [
      "/api/batches/../admin/batches/x/mark-paid?/checkout/sync",
      "/api/batches/./x",
      "/api//admin/overview",
      "/api/batches/x/mark-paid#/checkout/sync",
      "/api/x?a#b",
      "/other/api/me",
      "api/me",
    ]) {
      expect(() => safePath(path), path).toThrow(ApiError);
    }
  });
});

describe("isUuid", () => {
  it("accepts ids as the API prints them and nothing else", () => {
    expect(isUuid("8f1d6a52-3c1e-4b6f-9a2d-6c0e5b7a9d01")).toBe(true);
    expect(isUuid("8F1D6A52-3C1E-4B6F-9A2D-6C0E5B7A9D01")).toBe(false);
    expect(isUuid("../admin/batches/x/mark-paid?")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});
