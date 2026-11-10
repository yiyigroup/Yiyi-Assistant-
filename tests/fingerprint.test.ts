import { describe, expect, it } from "vitest";
import { fingerprintsMatch, rowFingerprint } from "@/lib/orders/fingerprint";

describe("fingerprint", () => {
  it("changes when source content changes and matches identical payloads", () => {
    const a = rowFingerprint({
      sourceSheet: "邮寄",
      sourceRow: 3,
      orderNumber: "1",
      name: "A",
      content: "x",
      amountRaw: "10",
      arrivalOriginal: "到齐",
      paymentOriginal: "已付",
      originalRow: ["到齐", "已付", "1", "A", "x", "10"],
    });
    const b = rowFingerprint({
      sourceSheet: "邮寄",
      sourceRow: 3,
      orderNumber: "1",
      name: "A",
      content: "x changed",
      amountRaw: "10",
      arrivalOriginal: "到齐",
      paymentOriginal: "已付",
      originalRow: ["到齐", "已付", "1", "A", "x changed", "10"],
    });
    expect(fingerprintsMatch(a, a)).toBe(true);
    expect(fingerprintsMatch(a, b)).toBe(false);
  });
});
