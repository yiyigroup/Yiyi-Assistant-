import { classifyFulfillment, fulfillmentConflictIssue } from "./classify";
import type { CustomerGroup, OrderRow } from "./types";

export function normalizeName(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s\u3000]+/g, "");
}

export function normalizePhone(v: unknown): string {
  return String(v || "")
    .replace(/\D/g, "")
    .replace(/^1(?=\d{10}$)/, "");
}

/**
 * Group by normalized name (legacy behavior).
 * Different names sharing a phone are flagged for review — never auto-merged.
 */
export function groupCustomers(orders: OrderRow[]): CustomerGroup[] {
  const map = new Map<string, CustomerGroup>();
  for (const o of orders) {
    const key = normalizeName(o.name) || o.id;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        name: o.name,
        orders: [],
        fulfillment: "待分类",
        phones: [],
        routes: [],
      };
      map.set(key, g);
    }
    g.orders.push(o);
  }

  const groups = [...map.values()];
  for (const g of groups) {
    g.phones = [...new Set(g.orders.map((o) => o.phoneKey).filter(Boolean))];
    g.routes = [...new Set(g.orders.map((o) => o.route))];
    g.fulfillment = classifyFulfillment(g.orders);
    const conflict = fulfillmentConflictIssue(g.fulfillment);
    if (conflict) {
      for (const o of g.orders) {
        if (!o.issues.includes(conflict)) o.issues.push(conflict);
      }
    }
    if (g.phones.length > 1) {
      const msg = "同名订单存在多个电话号码，请确认是否同一客户";
      for (const o of g.orders) {
        if (!o.issues.includes(msg)) o.issues.push(msg);
      }
    }
  }

  // Flag different names sharing a phone — do not merge.
  for (const g of groups) {
    for (const phone of g.phones) {
      const others = groups.filter((other) => other.key !== g.key && other.phones.includes(phone));
      if (others.length) {
        const msg = `可能存在同一电话下的其他姓名：${others.map((x) => x.name).join("、")}。请确认后再合并，系统暂不自动合并。`;
        for (const o of g.orders) {
          if (!o.issues.includes(msg)) o.issues.push(msg);
        }
      }
    }
  }

  return groups.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}
