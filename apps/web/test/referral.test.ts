import { describe, expect, it } from "vitest";

import { REFERRAL_TTL_MS, normalizeReferralCode, parseReferral, referralState, referralUrl, serializeReferral } from "@/lib/referral";

describe("normalizeReferralCode", () => {
  it("accepts 6 to 12 letters and digits, in any case", () => {
    expect(normalizeReferralCode(" k7m2qxpa ")).toBe("K7M2QXPA");
    expect(normalizeReferralCode("ABC123")).toBe("ABC123");
    for (const bad of [null, undefined, "", "ABC12", "K7M2-QXPA", "ABCDEFGHIJKLM", "ÁBCDEFG"]) {
      expect(normalizeReferralCode(bad)).toBeNull();
    }
  });
});

describe("stored referral", () => {
  const now = 1_800_000_000_000;

  it("keeps a code for 30 days", () => {
    const raw = serializeReferral("K7M2QXPA", now);
    expect(parseReferral(raw, now)).toBe("K7M2QXPA");
    expect(parseReferral(raw, now + REFERRAL_TTL_MS)).toBe("K7M2QXPA");
    expect(parseReferral(raw, now + REFERRAL_TTL_MS + 1)).toBeNull();
  });

  it("ignores anything else", () => {
    expect(parseReferral(null, now)).toBeNull();
    expect(parseReferral("not json", now)).toBeNull();
    expect(parseReferral('{"code":"<script>","savedAt":1}', now)).toBeNull();
    expect(parseReferral('{"code":"K7M2QXPA"}', now)).toBeNull();
    expect(parseReferral(serializeReferral("K7M2QXPA", now + 60_000), now)).toBeNull();
  });
});

describe("referral links and states", () => {
  it("builds the invite link", () => {
    expect(referralUrl("https://ingressoimpresso.com.br/", "K7M2QXPA")).toBe("https://ingressoimpresso.com.br/i/K7M2QXPA");
  });

  it("reads a capped reward apart", () => {
    expect(referralState({ status: "pending", capped: false })).toBe("pending");
    expect(referralState({ status: "rewarded", capped: false })).toBe("rewarded");
    expect(referralState({ status: "rewarded", capped: true })).toBe("capped");
    expect(referralState({ status: "revoked", capped: true })).toBe("revoked");
  });
});
