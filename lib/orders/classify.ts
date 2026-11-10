import type { Fulfillment, OrderRow } from "./types";

/** Port of legacy getGroups fulfillment rules from dist/orders.js. */
export function classifyFulfillment(orders: OrderRow[]): Fulfillment {
  const hasPickup = orders.some((o) => /自提|自取/.test(o.content));
  const hasMail = orders.some((o) => /送货费/.test(o.content));
  if (hasPickup && hasMail) return "待确认";
  if (hasPickup) return "自提";
  if (hasMail) return "邮寄";

  const routes = new Set(orders.map((o) => o.route));
  if (routes.has("自提")) return "自提";
  if (routes.has("邮寄")) return "邮寄";
  return "待分类";
}

export function fulfillmentConflictIssue(fulfillment: Fulfillment): string | null {
  if (fulfillment !== "待确认") return null;
  return "同一客户的订单同时出现“自提”和“送货费”，请确认配送方式";
}

export function routeForSheet(sheet: string, row: unknown[]): string {
  const s = String(sheet || "");
  if (s.includes("95008")) return "95008";
  if (s.includes("三谷")) return "三谷";
  if (s.includes("邮寄") || s.includes("郵寄")) return "邮寄";
  if (s.includes("自提") || s.includes("自取")) return "自提";
  const explicit = row
    .map((v) => String(v ?? "").trim())
    .find((v) => /^(邮寄|郵寄|自提|自取)$/.test(v));
  if (explicit === "郵寄") return "邮寄";
  if (explicit === "自取") return "自提";
  return explicit || "待分类";
}
