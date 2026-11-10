import { describe, expect, it } from "vitest";
import { groupCustomers, normalizePhone } from "@/lib/orders/group";
import type { OrderRow } from "@/lib/orders/types";

function base(partial: Partial<OrderRow>): OrderRow {
  const phone = partial.phone ?? "";
  return {
    id: partial.id ?? "1",
    sourceSheet: partial.sourceSheet ?? "邮寄",
    sourceRow: partial.sourceRow ?? 2,
    route: partial.route ?? "邮寄",
    name: partial.name ?? "Aliya",
    phone,
    phoneKey: normalizePhone(phone),
    zip: partial.zip ?? "",
    address: partial.address ?? "",
    orderNumber: partial.orderNumber ?? "1",
    content: partial.content ?? "item",
    amount: partial.amount ?? 1,
    amountRaw: partial.amountRaw ?? "1",
    arrivalOriginal: partial.arrivalOriginal ?? "",
    paymentOriginal: partial.paymentOriginal ?? "",
    items: partial.items ?? [],
    issues: partial.issues ?? [],
    originalRow: partial.originalRow ?? [],
  };
}

describe("groupCustomers", () => {
  it("does not merge different names sharing a phone; flags review", () => {
    const groups = groupCustomers([
      base({ id: "1", name: "Aliya", phone: "408-555-0100" }),
      base({ id: "2", name: "Alisha", phone: "4085550100" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(
      groups.some((g) => g.orders.some((o) => o.issues.some((i) => i.includes("其他姓名")))),
    ).toBe(true);
  });

  it("preserves region routes independently of fulfillment", () => {
    const groups = groupCustomers([
      base({
        id: "1",
        name: "A",
        content: "自提",
        sourceSheet: "三谷",
        route: "三谷",
      }),
    ]);
    expect(groups[0]?.fulfillment).toBe("自提");
    expect(groups[0]?.routes).toContain("三谷");
  });
});
