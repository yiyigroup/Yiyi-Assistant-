import type { CustomerGroup, OrderItem, OrderRow } from "./types";

/** Queue filter keys shown in the dashboard (legacy arrival + ops buckets). */
export const QUEUE_FILTERS = [
  "all",
  "waiting",
  "partial",
  "arrived",
  "pack",
  "to_ship",
  "shipped",
  "unpaid",
  "paid",
  "to_archive",
  "archived",
] as const;

export type QueueFilter = (typeof QUEUE_FILTERS)[number];

export const QUEUE_FILTER_LABELS: Record<QueueFilter, string> = {
  all: "全部客户",
  waiting: "待到货",
  partial: "部分到货",
  arrived: "全部到齐",
  pack: "待打包",
  to_ship: "待发货",
  shipped: "已发货",
  unpaid: "待收款",
  paid: "已收款",
  to_archive: "待归档",
  archived: "已归档",
};

export type ArrivalBucket = "waiting" | "partial" | "arrived" | "empty";

export type LineMoney = {
  qty: number | null;
  unitPrice: number | null;
  lineSubtotal: number | null;
  /** True when amount was split across items by quantity share. */
  allocated: boolean;
};

const str = (v: unknown) => String(v ?? "").trim();

/** Legacy: flatten order items for a customer. */
export function allItems(g: CustomerGroup): { order: OrderRow; item: OrderItem }[] {
  return g.orders.flatMap((o) => o.items.map((item) => ({ order: o, item })));
}

/**
 * Legacy `arrived(g)`: every item status is arrived (and at least one item).
 * Also treat order-level 到齐 when the row has no split items.
 */
export function isFullyArrived(g: CustomerGroup): boolean {
  return arrivalBucket(g) === "arrived";
}

export function needsReview(g: CustomerGroup): boolean {
  return (
    g.fulfillment === "待确认" ||
    g.fulfillment === "待分类" ||
    g.orders.some((o) => o.issues.length > 0)
  );
}

export function arrivalBucket(g: CustomerGroup): ArrivalBucket {
  const items = allItems(g);
  if (items.length === 0) {
    const texts = g.orders.map((o) => o.arrivalOriginal);
    if (texts.length && texts.every((t) => /到齐|全部到|全到/.test(t))) return "arrived";
    if (texts.some((t) => /差|缺|未到|部分/.test(t))) return "partial";
    if (texts.some((t) => /到齐|全部到|全到|到货/.test(t))) return "partial";
    return texts.some(Boolean) ? "waiting" : "empty";
  }
  const arrived = items.filter((x) => x.item.status === "arrived").length;
  if (arrived === items.length) return "arrived";
  if (arrived > 0) return "partial";
  if (items.some((x) => x.item.status === "missing")) return "partial";
  return "waiting";
}

/** Paid when every order payment cell looks settled. */
export function isPaidText(raw: string): boolean {
  const t = str(raw);
  if (!t) return false;
  if (/未付|待付|欠款|未收款|未收/.test(t)) return false;
  return /已付|已收款|已收齐|收齐|paid|paid\b/i.test(t);
}

export function isGroupPaid(g: CustomerGroup): boolean {
  if (!g.orders.length) return false;
  return g.orders.every((o) => isPaidText(o.paymentOriginal));
}

export function isGroupUnpaid(g: CustomerGroup): boolean {
  return g.orders.some((o) => !isPaidText(o.paymentOriginal));
}

/** Shipped markers in payment / arrival / content (Sheet-backed text only). */
export function isShippedText(raw: string): boolean {
  const t = str(raw);
  if (!t) return false;
  return /已发货|已寄出|已寄|已邮寄|已发(?!票)|运单|快递单|tracking|shipped/i.test(t);
}

export function isGroupShipped(g: CustomerGroup): boolean {
  return g.orders.some(
    (o) =>
      isShippedText(o.paymentOriginal) ||
      isShippedText(o.arrivalOriginal) ||
      isShippedText(o.content),
  );
}

export function isArchivedText(raw: string): boolean {
  return /已归档|归档完成|已完成归档/.test(str(raw));
}

export function isGroupArchived(g: CustomerGroup): boolean {
  return g.orders.some(
    (o) => isArchivedText(o.paymentOriginal) || isArchivedText(o.arrivalOriginal),
  );
}

/**
 * 待打包: fully arrived, not shipped, fulfillment is 邮寄 or 自提
 * (legacy: 全部到齐 → 自提或待打包队列).
 */
export function isPackReady(g: CustomerGroup): boolean {
  if (!isFullyArrived(g) || isGroupShipped(g) || isGroupArchived(g)) return false;
  return g.fulfillment === "邮寄" || g.fulfillment === "自提";
}

/** 待发货: mail customers fully arrived and not yet shipped. */
export function isAwaitingShipment(g: CustomerGroup): boolean {
  return (
    isFullyArrived(g) &&
    g.fulfillment === "邮寄" &&
    !isGroupShipped(g) &&
    !isGroupArchived(g)
  );
}

/**
 * 待归档: shipped+paid (mail) or arrived+paid (pickup) — archive eligibility,
 * still on active tabs (not yet 已归档 marker).
 */
export function isArchiveReady(g: CustomerGroup): boolean {
  if (isGroupArchived(g) || !isGroupPaid(g) || !isFullyArrived(g)) return false;
  if (g.fulfillment === "自提") return true;
  return isGroupShipped(g);
}

export function matchesQueueFilter(g: CustomerGroup, filter: QueueFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "waiting":
      return arrivalBucket(g) === "waiting" || arrivalBucket(g) === "empty";
    case "partial":
      return arrivalBucket(g) === "partial";
    case "arrived":
      return isFullyArrived(g);
    case "pack":
      return isPackReady(g);
    case "to_ship":
      return isAwaitingShipment(g);
    case "shipped":
      return isGroupShipped(g);
    case "unpaid":
      return isGroupUnpaid(g);
    case "paid":
      return isGroupPaid(g);
    case "to_archive":
      return isArchiveReady(g);
    case "archived":
      return isGroupArchived(g);
    default:
      return true;
  }
}

/** Search by customer name and phone (also tolerates order number like legacy). */
export function matchesQueueSearch(g: CustomerGroup, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  const phones = g.orders.map((o) => o.phone).join(" ");
  const phoneKeys = g.phones.join(" ");
  const orders = g.orders.map((o) => o.orderNumber).join(" ");
  const hay = `${g.name} ${phones} ${phoneKeys} ${orders}`.toLocaleLowerCase();
  return hay.includes(q);
}

export function filterCustomerQueue(
  groups: CustomerGroup[],
  opts: { filter?: QueueFilter; query?: string },
): CustomerGroup[] {
  const filter = opts.filter ?? "all";
  const query = opts.query ?? "";
  return groups.filter((g) => matchesQueueSearch(g, query) && matchesQueueFilter(g, filter));
}

export function queueFilterCounts(groups: CustomerGroup[]): Record<QueueFilter, number> {
  const counts = {} as Record<QueueFilter, number>;
  for (const key of QUEUE_FILTERS) {
    counts[key] = key === "all" ? groups.length : groups.filter((g) => matchesQueueFilter(g, key)).length;
  }
  return counts;
}

/**
 * Allocate order amount across line items by quantity share.
 * Single-item rows: subtotal = order amount; unit = amount/qty when qty known.
 */
export function lineMoney(order: OrderRow, item: OrderItem): LineMoney {
  const items = order.items;
  const amount = order.amount;
  if (amount == null || !Number.isFinite(amount)) {
    return { qty: item.qty, unitPrice: null, lineSubtotal: null, allocated: false };
  }
  if (items.length <= 1) {
    const qty = item.qty;
    return {
      qty,
      unitPrice: qty && qty > 0 ? amount / qty : null,
      lineSubtotal: amount,
      allocated: false,
    };
  }
  const qtys = items.map((i) => i.qty);
  if (qtys.some((q) => q == null || q <= 0)) {
    // Cannot fairly split — only attribute full amount to first item for visibility.
    const first = items[0]?.id === item.id;
    return {
      qty: item.qty,
      unitPrice: null,
      lineSubtotal: first ? amount : null,
      allocated: false,
    };
  }
  const totalQty = qtys.reduce<number>((s, q) => s + (q as number), 0);
  const share = ((item.qty as number) / totalQty) * amount;
  const unit = item.qty && item.qty > 0 ? share / item.qty : null;
  return {
    qty: item.qty,
    unitPrice: unit,
    lineSubtotal: share,
    allocated: true,
  };
}

export function customerMerchandiseTotal(g: CustomerGroup): number {
  return g.orders.reduce((sum, o) => sum + (o.amount ?? 0), 0);
}

export function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}
