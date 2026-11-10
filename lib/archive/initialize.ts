export const ARCHIVE_HEADERS = [
  "timestamp",
  "op_id",
  "actor_email",
  "source_tab",
  "source_row",
  "order_number",
  "customer",
  "content",
  "amount",
  "arrival",
  "payment",
  "fulfillment",
  "region",
  "test_tracking",
  "original_row_snapshot",
] as const;

export type ArchiveInitializeResult =
  | { status: "created"; headers: readonly string[] }
  | { status: "already_exists"; headers: readonly string[] };

/**
 * Idempotent initialize of 完成记录. Never reuses the shippo fee tab.
 * Actual Sheets write happens in the route with a mockable adapter.
 */
export function planArchiveInitialize(existingTabNames: string[]): ArchiveInitializeResult {
  if (existingTabNames.includes("完成记录")) {
    return { status: "already_exists", headers: ARCHIVE_HEADERS };
  }
  if (
    existingTabNames.map((n) => n.toLowerCase()).includes("shippo") &&
    !existingTabNames.includes("完成记录")
  ) {
    // shippo stays fee-only; still create separate archive tab
  }
  return { status: "created", headers: ARCHIVE_HEADERS };
}
