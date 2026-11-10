import { describe, expect, it } from "vitest";
import { parseAllowedEmails, isEmailAllowed } from "@/lib/auth/allowlist";
import { requireSameOrigin } from "@/lib/auth/origin";

describe("auth allowlist", () => {
  it("parses ALLOWED_EMAILS and rejects others", () => {
    const set = parseAllowedEmails("a@x.com, b@y.com");
    expect(set.has("a@x.com")).toBe(true);
    expect(set.has("b@y.com")).toBe(true);
  });

  it("isEmailAllowed uses env allowlist", () => {
    const prev = process.env.ALLOWED_EMAILS;
    process.env.ALLOWED_EMAILS = "ops@example.com";
    expect(isEmailAllowed("ops@example.com")).toBe(true);
    expect(isEmailAllowed("other@example.com")).toBe(false);
    expect(isEmailAllowed(null)).toBe(false);
    process.env.ALLOWED_EMAILS = prev;
  });

  it("rejects cross-origin mutating requests", () => {
    const bad = requireSameOrigin(
      new Request("https://app.example/api/x", {
        method: "POST",
        headers: { origin: "https://evil.example", host: "app.example" },
      }),
    );
    expect(bad.ok).toBe(false);

    const good = requireSameOrigin(
      new Request("https://app.example/api/x", {
        method: "POST",
        headers: { origin: "https://app.example", host: "app.example" },
      }),
    );
    expect(good.ok).toBe(true);
  });
});
