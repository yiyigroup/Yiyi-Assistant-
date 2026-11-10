import { describe, expect, it } from "vitest";
import { normalizeZip, proposeRegion } from "@/lib/region/zip";

describe("region ZIP routing", () => {
  it("exact seed match proposes region", () => {
    expect(proposeRegion("94506")).toEqual({ status: "exact", region: "三谷", zip: "94506" });
    expect(proposeRegion("95008-1234")).toEqual({
      status: "exact",
      region: "95008",
      zip: "95008",
    });
  });

  it("nearby within 10 miles needs operator confirm", () => {
    const r = proposeRegion("94507");
    expect(r.status).toBe("nearby");
    if (r.status === "nearby") {
      expect(r.note).toBe("附近邮编，需确认");
      expect(r.region).toBe("三谷");
    }
  });

  it("malformed / unknown / street-number trap", () => {
    expect(normalizeZip("abc")).toBeNull();
    expect(proposeRegion("not-a-zip").status).toBe("conflict");
    expect(proposeRegion("21028").status).toBe("none");
    expect(proposeRegion("99999").status).toBe("none");
  });
});
