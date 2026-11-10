import type { OrderRow } from "@/lib/orders/types";
import type { OrderTab } from "@/lib/config/sheet";
import type { ImportPreview } from "./preview";
import { memoryIdempotencyStore, type IdempotencyStore } from "@/lib/idempotency/store";

export type ImportRowResult = {
  id: string;
  name: string;
  orderNumber: string;
  disposition: "inserted" | "skipped_duplicate" | "needs_review";
  targetTab: OrderTab | null;
  issues: string[];
};

export type ImportCommitResult = {
  opId: string;
  inserted: OrderRow[];
  skipped: OrderRow[];
  needsReview: OrderRow[];
  /** Rows actually appended, grouped by tab (append-only; never full-sheet replace). */
  byTab: Partial<Record<OrderTab, OrderRow[]>>;
  rowResults: ImportRowResult[];
  reused: boolean;
};

export async function commitImport(args: {
  preview: ImportPreview;
  /** Optional fallback tab for needs_review rows that lack proposedTab. */
  fallbackTab?: OrderTab | null;
  store?: IdempotencyStore;
}): Promise<ImportCommitResult> {
  const store = args.store ?? memoryIdempotencyStore;
  const opId = `import:${args.preview.fileHash}`;
  const existing = await store.get(opId);
  if (existing) {
    return { ...(existing.result as ImportCommitResult), reused: true };
  }

  const byTab: Partial<Record<OrderTab, OrderRow[]>> = {};
  const inserted: OrderRow[] = [];
  const skipped: OrderRow[] = [];
  const needsReview: OrderRow[] = [];
  const rowResults: ImportRowResult[] = [];

  for (const row of args.preview.rows) {
    if (row.disposition === "skipped_duplicate") {
      skipped.push(row.order);
      rowResults.push({
        id: row.order.id,
        name: row.order.name,
        orderNumber: row.order.orderNumber,
        disposition: "skipped_duplicate",
        targetTab: null,
        issues: row.order.issues,
      });
      continue;
    }

    const targetTab = row.proposedTab ?? args.fallbackTab ?? null;
    if (!targetTab) {
      needsReview.push(row.order);
      rowResults.push({
        id: row.order.id,
        name: row.order.name,
        orderNumber: row.order.orderNumber,
        disposition: "needs_review",
        targetTab: null,
        issues: [...row.order.issues, "无目标工作表，未写入"],
      });
      continue;
    }

    if (!byTab[targetTab]) byTab[targetTab] = [];
    byTab[targetTab]!.push(row.order);
    inserted.push(row.order);
    if (row.disposition === "needs_review") needsReview.push(row.order);

    rowResults.push({
      id: row.order.id,
      name: row.order.name,
      orderNumber: row.order.orderNumber,
      disposition: row.disposition === "needs_review" ? "needs_review" : "inserted",
      targetTab,
      issues: row.order.issues,
    });
  }

  const result: ImportCommitResult = {
    opId,
    inserted,
    skipped,
    needsReview,
    byTab,
    rowResults,
    reused: false,
  };
  await store.put({
    key: opId,
    op: "import.commit",
    createdAt: new Date().toISOString(),
    result,
  });
  return result;
}
