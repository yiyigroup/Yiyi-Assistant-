import { describe, expect, it } from "vitest";
import { classifyFulfillment, routeForSheet } from "@/lib/orders/classify";
import type { OrderRow } from "@/lib/orders/types";

function row(partial: Partial<OrderRow> & { content: string; route?: string }): OrderRow {
  return {
    id: partial.id ?? "1",
    sourceSheet: partial.sourceSheet ?? "邮寄",
    sourceRow: partial.sourceRow ?? 2,
    route: partial.route ?? "邮寄",
    name: partial.name ?? "A",
    phone: partial.phone ?? "",
    phoneKey: partial.phoneKey ?? "",
    zip: partial.zip ?? "",
    address: partial.address ?? "",
    orderNumber: partial.orderNumber ?? "1",
    content: partial.content,
    amount: partial.amount ?? 10,
    amountRaw: partial.amountRaw ?? "10",
    arrivalOriginal: partial.arrivalOriginal ?? "",
    paymentOriginal: partial.paymentOriginal ?? "",
    items: partial.items ?? [],
    issues: partial.issues ?? [],
    originalRow: partial.originalRow ?? [],
  };
}

describe("classifyFulfillment", () => {
  it("marks pickup when content has 自提/自取", () => {
    expect(classifyFulfillment([row({ content: "雨靴 自提" })])).toBe("自提");
    expect(classifyFulfillment([row({ content: "外套自取" })])).toBe("自提");
  });

  it("marks mail when content has 送货费", () => {
    expect(classifyFulfillment([row({ content: "帽子 送货费7" })])).toBe("邮寄");
  });

  it("requires manual confirm when both markers present", () => {
    expect(
      classifyFulfillment([row({ content: "A 自提" }), row({ content: "B 送货费", id: "2" })]),
    ).toBe("待确认");
  });

  it("falls back to sheet route then 待分类", () => {
    expect(classifyFulfillment([row({ content: "普通商品", route: "自提" })])).toBe("自提");
    expect(classifyFulfillment([row({ content: "普通商品", route: "邮寄" })])).toBe("邮寄");
    expect(classifyFulfillment([row({ content: "普通商品", route: "待分类" })])).toBe("待分类");
  });
});

describe("routeForSheet", () => {
  it("derives region and fulfillment routes from sheet names", () => {
    expect(routeForSheet("三谷", [])).toBe("三谷");
    expect(routeForSheet("95008", [])).toBe("95008");
    expect(routeForSheet("邮寄", [])).toBe("邮寄");
    expect(routeForSheet("自提", [])).toBe("自提");
  });
});
