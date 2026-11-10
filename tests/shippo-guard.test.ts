import { describe, expect, it } from "vitest";
import { assertTestShippoToken, assertWasTest, isConfiguredTestToken } from "@/lib/shippo/client";
import { createTestLabel } from "@/lib/shippo/rates";

describe("shippo test-only guard", () => {
  it("accepts shippo_test_ tokens and refuses live", () => {
    expect(isConfiguredTestToken("shippo_test_12345678901234567890")).toBe(true);
    expect(() => assertTestShippoToken("shippo_live_12345678901234567890")).toThrow(
      /refused|not configured|Live/i,
    );
    expect(isConfiguredTestToken("shippo_live_12345678901234567890")).toBe(false);
    expect(isConfiguredTestToken("short")).toBe(false);
  });

  it("withholds labels unless was_test === true", async () => {
    expect(() => assertWasTest({ was_test: false })).toThrow(/test transaction/i);
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ was_test: false, status: "SUCCESS" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    await expect(
      createTestLabel({
        token: "shippo_test_12345678901234567890",
        rateId: "rate_1",
        fetchImpl,
      }),
    ).rejects.toThrow(/test transaction/i);
  });
});
