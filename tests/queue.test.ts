import { describe, expect, it } from "vitest";
import { groupCustomers, normalizePhone } from "@/lib/orders/group";
import type { OrderRow } from "@/lib/orders/types";
import {
  arrivalBucket,
  customerMerchandiseTotal,
  filterCustomerQueue,
  isArchiveReady,
  isFullyArrived,
  isGroupPaid,
  isGroupShipped,
  isPackReady,
  lineMoney,
  matchesQueueFilter,
} from "@/lib/orders/queue";

function base(partial: Partial<OrderRow>): OrderRow {
  const phone = partial.phone ?? "4085550100";
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
    content: partial.content ?? "外套x1 送货费",
    amount: partial.amount ?? 38,
    amountRaw: partial.amountRaw ?? "38",
    arrivalOriginal: partial.arrivalOriginal ?? "",
    paymentOriginal: partial.paymentOriginal ?? "",
    items: partial.items ?? [
      { id: "0", raw: "外套x1", qty: 1, status: "waiting" },
    ],
    issues: partial.issues ?? [],
    originalRow: partial.originalRow ?? [],
  };
}

describe("customer queue buckets", () => {
  it("splits waiting / partial / arrived like legacy item status", () => {
    const waiting = groupCustomers([
      base({
        id: "w",
        items: [{ id: "0", raw: "a", qty: 1, status: "waiting" }],
      }),
    ])[0]!;
    const partial = groupCustomers([
      base({
        id: "p",
        name: "Partial",
        arrivalOriginal: "差1个",
        items: [
          { id: "0", raw: "a到货", qty: 1, status: "arrived" },
          { id: "1", raw: "b缺货", qty: 1, status: "missing" },
        ],
      }),
    ])[0]!;
    const arrived = groupCustomers([
      base({
        id: "a",
        name: "Ready",
        arrivalOriginal: "到齐",
        content: "外套x1 送货费",
        items: [{ id: "0", raw: "外套x1", qty: 1, status: "arrived" }],
      }),
    ])[0]!;

    expect(arrivalBucket(waiting)).toBe("waiting");
    expect(arrivalBucket(partial)).toBe("partial");
    expect(isFullyArrived(arrived)).toBe(true);
    expect(matchesQueueFilter(waiting, "waiting")).toBe(true);
    expect(matchesQueueFilter(partial, "partial")).toBe(true);
    expect(matchesQueueFilter(arrived, "arrived")).toBe(true);
  });

  it("marks 待打包 / 待发货 for fully arrived mail customers", () => {
    const g = groupCustomers([
      base({
        arrivalOriginal: "到齐",
        content: "外套x1 送货费",
        items: [{ id: "0", raw: "外套x1", qty: 1, status: "arrived" }],
      }),
    ])[0]!;
    expect(g.fulfillment).toBe("邮寄");
    expect(isPackReady(g)).toBe(true);
    expect(matchesQueueFilter(g, "pack")).toBe(true);
    expect(matchesQueueFilter(g, "to_ship")).toBe(true);
  });

  it("uses payment / shipped text from Sheet fields", () => {
    const unpaid = groupCustomers([base({ paymentOriginal: "未付" })])[0]!;
    const paid = groupCustomers([
      base({
        name: "Paid",
        paymentOriginal: "已付",
        arrivalOriginal: "到齐",
        items: [{ id: "0", raw: "x", qty: 1, status: "arrived" }],
      }),
    ])[0]!;
    const shipped = groupCustomers([
      base({
        name: "Ship",
        paymentOriginal: "已付 已发货",
        arrivalOriginal: "到齐",
        items: [{ id: "0", raw: "x", qty: 1, status: "arrived" }],
      }),
    ])[0]!;

    expect(matchesQueueFilter(unpaid, "unpaid")).toBe(true);
    expect(isGroupPaid(paid)).toBe(true);
    expect(matchesQueueFilter(paid, "paid")).toBe(true);
    expect(isGroupShipped(shipped)).toBe(true);
    expect(matchesQueueFilter(shipped, "shipped")).toBe(true);
    expect(isArchiveReady(shipped)).toBe(true);
    expect(matchesQueueFilter(shipped, "to_archive")).toBe(true);
  });

  it("searches by name and phone", () => {
    const groups = groupCustomers([
      base({ name: "Amy", phone: "408-555-0199" }),
      base({ id: "2", name: "Ben", phone: "5105550100", orderNumber: "9" }),
    ]);
    expect(filterCustomerQueue(groups, { query: "amy" })).toHaveLength(1);
    expect(filterCustomerQueue(groups, { query: "510555" })).toHaveLength(1);
    expect(filterCustomerQueue(groups, { filter: "all", query: "nobody" })).toHaveLength(0);
  });
});

describe("line money", () => {
  it("computes unit price and subtotal for single-item orders", () => {
    const order = base({
      amount: 16,
      items: [{ id: "0", raw: "饼干x2", qty: 2, status: "waiting" }],
    });
    const m = lineMoney(order, order.items[0]!);
    expect(m.lineSubtotal).toBe(16);
    expect(m.unitPrice).toBe(8);
  });

  it("allocates multi-item amounts by quantity share", () => {
    const order = base({
      amount: 30,
      items: [
        { id: "0", raw: "a x1", qty: 1, status: "waiting" },
        { id: "1", raw: "b x2", qty: 2, status: "waiting" },
      ],
    });
    const a = lineMoney(order, order.items[0]!);
    const b = lineMoney(order, order.items[1]!);
    expect(a.lineSubtotal).toBe(10);
    expect(b.lineSubtotal).toBe(20);
    expect(a.allocated).toBe(true);
    const g = groupCustomers([order])[0]!;
    expect(customerMerchandiseTotal(g)).toBe(30);
  });
});
