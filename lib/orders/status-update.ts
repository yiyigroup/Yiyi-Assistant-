import { HEADER_ALIASES, colIndex } from "@/lib/sheets/headers";
import { cellA1 } from "@/lib/sheets/a1";
import type { CellUpdate, SheetsAdapter } from "@/lib/sheets/client";
import { assertOrderTab, loadOrdersFromSheets, orderFingerprint } from "@/lib/sheets/rows";
import type { OrderRow } from "@/lib/orders/types";
import type { OrderTab } from "@/lib/config/sheet";
import {
  memoryIdempotencyStore,
  runIdempotent,
  type IdempotencyStore,
} from "@/lib/idempotency/store";

export type StatusField = "arrival" | "payment";

export type StatusCellPatch = CellUpdate & { field: StatusField };

export type StatusUpdateInput = {
  opId: string;
  sourceTab: string;
  sourceRow: number;
  expectedFingerprint: string;
  arrival?: string;
  payment?: string;
  /** Must be true — writes never happen without explicit confirm. */
  confirm: true;
};

export type StatusUpdateSuccess = {
  ok: true;
  opId: string;
  sourceTab: OrderTab;
  sourceRow: number;
  arrival: string;
  payment: string;
  fingerprint: string;
  order: OrderRow;
  reused: boolean;
};

export type StatusUpdateConflict = {
  ok: false;
  error: "Fingerprint conflict";
  liveFingerprint: string;
  arrival: string;
  payment: string;
  order: OrderRow;
};

export type StatusUpdateMissing = {
  ok: false;
  error: "Row not found";
};

export type StatusUpdateColumnError = {
  ok: false;
  error: string;
};

export type StatusUpdateResult =
  | StatusUpdateSuccess
  | StatusUpdateConflict
  | StatusUpdateMissing
  | StatusUpdateColumnError;

/**
 * Map arrival/payment patches onto Sheet columns using header aliases.
 * Only the requested fields are included; other cells stay untouched.
 */
export function buildStatusCellUpdates(args: {
  headers: unknown[];
  sourceRow: number;
  arrival?: string;
  payment?: string;
}): StatusCellPatch[] {
  if (args.arrival === undefined && args.payment === undefined) {
    throw new Error("At least one of arrival or payment is required");
  }
  const out: StatusCellPatch[] = [];
  if (args.arrival !== undefined) {
    const i = colIndex(args.headers, [...HEADER_ALIASES.arrival]);
    if (i < 0) throw new Error("Arrival column not found in sheet headers");
    out.push({ field: "arrival", a1: cellA1(i, args.sourceRow), value: args.arrival });
  }
  if (args.payment !== undefined) {
    const i = colIndex(args.headers, [...HEADER_ALIASES.payment]);
    if (i < 0) throw new Error("Payment column not found in sheet headers");
    out.push({ field: "payment", a1: cellA1(i, args.sourceRow), value: args.payment });
  }
  return out;
}

function findHeaderRow(rows: unknown[][]): unknown[] {
  const headIdx = rows.findIndex((r) => r && r.some((c) => String(c ?? "").trim()));
  if (headIdx < 0) throw new Error("Sheet has no header row");
  return rows[headIdx]!;
}

/**
 * Confirmed status write with row-fingerprint optimistic locking.
 * Re-reads after write and returns the updated fingerprint + values.
 */
export async function applyOrderStatusUpdate(
  adapter: SheetsAdapter,
  input: StatusUpdateInput,
  opts?: { store?: IdempotencyStore },
): Promise<StatusUpdateResult> {
  if (input.confirm !== true) {
    return { ok: false, error: "Explicit confirm required" };
  }
  if (input.arrival === undefined && input.payment === undefined) {
    return { ok: false, error: "At least one of arrival or payment is required" };
  }

  const store = opts?.store ?? memoryIdempotencyStore;
  const tab = assertOrderTab(input.sourceTab);

  const { result, reused } = await runIdempotent<StatusUpdateResult>(
    store,
    input.opId,
    "orders.status",
    async () => {
      const { orders } = await loadOrdersFromSheets(adapter);
      const live = orders.find((o) => o.sourceSheet === tab && o.sourceRow === input.sourceRow);
      if (!live) return { ok: false, error: "Row not found" };

      const liveFp = orderFingerprint(live);
      if (liveFp !== input.expectedFingerprint) {
        return {
          ok: false,
          error: "Fingerprint conflict",
          liveFingerprint: liveFp,
          arrival: live.arrivalOriginal,
          payment: live.paymentOriginal,
          order: live,
        };
      }

      const rows = await adapter.readRange(tab, "A1:AZ5000");
      let patches: StatusCellPatch[];
      try {
        patches = buildStatusCellUpdates({
          headers: findHeaderRow(rows),
          sourceRow: input.sourceRow,
          arrival: input.arrival,
          payment: input.payment,
        });
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Column mapping failed" };
      }

      await adapter.updateCells(tab, patches.map(({ a1, value }) => ({ a1, value })));

      const after = await loadOrdersFromSheets(adapter);
      const updated = after.orders.find(
        (o) => o.sourceSheet === tab && o.sourceRow === input.sourceRow,
      );
      if (!updated) {
        return { ok: false, error: "Row not found after write" };
      }

      return {
        ok: true,
        opId: input.opId,
        sourceTab: tab,
        sourceRow: input.sourceRow,
        arrival: updated.arrivalOriginal,
        payment: updated.paymentOriginal,
        fingerprint: orderFingerprint(updated),
        order: updated,
        reused: false,
      };
    },
  );

  if (reused && result.ok) {
    return { ...result, reused: true };
  }
  return result;
}
