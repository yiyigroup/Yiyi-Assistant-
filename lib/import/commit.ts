import type { OrderRow } from "@/lib/orders/types";
import type { ImportPreview } from "./preview";
import { memoryIdempotencyStore, type IdempotencyStore } from "@/lib/idempotency/store";

export type ImportCommitResult = {
  opId: string;
  inserted: OrderRow[];
  skipped: OrderRow[];
  needsReview: OrderRow[];
  reused: boolean;
};

export async function commitImport(args: {
  preview: ImportPreview;
  store?: IdempotencyStore;
}): Promise<ImportCommitResult> {
  const store = args.store ?? memoryIdempotencyStore;
  const opId = `import:${args.preview.fileHash}`;
  const existing = await store.get(opId);
  if (existing) {
    return { ...(existing.result as ImportCommitResult), reused: true };
  }

  const inserted = args.preview.rows
    .filter((r) => r.disposition === "insert" || r.disposition === "needs_review")
    .map((r) => r.order);
  const skipped = args.preview.rows
    .filter((r) => r.disposition === "skipped_duplicate")
    .map((r) => r.order);
  const needsReview = args.preview.rows
    .filter((r) => r.disposition === "needs_review")
    .map((r) => r.order);

  const result: ImportCommitResult = {
    opId,
    inserted,
    skipped,
    needsReview,
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
