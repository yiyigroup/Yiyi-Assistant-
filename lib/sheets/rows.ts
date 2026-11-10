import { ORDER_TABS, type OrderTab } from "@/lib/config/sheet";
import { mapWorkbook } from "@/lib/import/parse";
import { rowFingerprint } from "@/lib/orders/fingerprint";
import type { OrderRow } from "@/lib/orders/types";
import type { SheetsAdapter } from "./client";

const BOUNDED = "A1:AZ5000";

export async function loadOrdersFromSheets(
  adapter: SheetsAdapter,
): Promise<{ orders: OrderRow[]; syncedAt: string; stale: false }> {
  const sheets = [];
  for (const tab of ORDER_TABS) {
    const rows = await adapter.readRange(tab, BOUNDED);
    sheets.push({ name: tab as string, rows });
  }
  const { orders } = mapWorkbook(sheets, "live-sheet");
  for (const o of orders) {
    o.id = `live|${o.sourceSheet}|${o.sourceRow}`;
  }
  return { orders, syncedAt: new Date().toISOString(), stale: false };
}

export function orderFingerprint(o: OrderRow): string {
  return rowFingerprint({
    sourceSheet: o.sourceSheet,
    sourceRow: o.sourceRow,
    orderNumber: o.orderNumber,
    name: o.name,
    content: o.content,
    amountRaw: o.amountRaw,
    arrivalOriginal: o.arrivalOriginal,
    paymentOriginal: o.paymentOriginal,
    originalRow: o.originalRow,
  });
}

export function assertOrderTab(name: string): OrderTab {
  if (!(ORDER_TABS as readonly string[]).includes(name)) {
    throw new Error("Invalid order tab");
  }
  return name as OrderTab;
}
