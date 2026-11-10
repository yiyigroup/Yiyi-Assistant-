import { z } from "zod";
import { requireApiAccess, noStoreJson } from "@/lib/auth/guard";
import { sha256Hex } from "@/lib/idempotency/hash";
import { memoryIdempotencyStore } from "@/lib/idempotency/store";
import { parseImportFile } from "@/lib/import/file";
import { previewImport } from "@/lib/import/preview";
import { commitImport } from "@/lib/import/commit";
import { getSheetsAdapter } from "@/lib/sheets/client";
import { loadOrdersFromSheets } from "@/lib/sheets/rows";
import { ORDER_TABS, isOrderTab } from "@/lib/config/sheet";
import type { OrderTab } from "@/lib/config/sheet";
import type { OrderRow } from "@/lib/orders/types";

const bodySchema = z.object({
  filename: z.string().min(1).max(240),
  contentBase64: z.string().min(1),
  confirm: z.literal(true),
  /** Optional fallback when a row has no proposed tab. */
  fallbackTab: z.string().optional(),
});

function toSheetCells(o: OrderRow): unknown[] {
  return [
    o.arrivalOriginal,
    o.paymentOriginal,
    o.orderNumber,
    o.name,
    o.content,
    o.amountRaw,
    ...o.originalRow.slice(6),
  ];
}

export async function POST(request: Request) {
  const access = await requireApiAccess(request, true);
  if (!access.ok) return access.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return noStoreJson({ error: "Invalid JSON" }, 400);
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return noStoreJson({ error: "Validation failed" }, 422);

  let fallbackTab: OrderTab | null = null;
  if (parsed.data.fallbackTab) {
    if (!isOrderTab(parsed.data.fallbackTab)) {
      return noStoreJson({ error: "Invalid fallback tab" }, 422);
    }
    fallbackTab = parsed.data.fallbackTab;
  }

  const buf = Buffer.from(parsed.data.contentBase64, "base64");
  const fileHash = sha256Hex(buf);

  let sheets;
  try {
    sheets = parseImportFile({ filename: parsed.data.filename, buffer: buf }).sheets;
  } catch (e) {
    return noStoreJson(
      { error: e instanceof Error ? e.message : "无法解析文件" },
      422,
    );
  }

  // Re-read live Sheet before commit (optimistic freshness + order-number dedupe).
  const adapter = getSheetsAdapter();
  const { orders: existing, syncedAt } = await loadOrdersFromSheets(adapter);

  const alreadyImportedHashes = new Set<string>();
  if (await memoryIdempotencyStore.get(`import:${fileHash}`)) {
    alreadyImportedHashes.add(fileHash);
  }

  const preview = previewImport({
    fileHash,
    sheets,
    existing,
    alreadyImportedHashes,
  });
  const result = await commitImport({ preview, fallbackTab });

  const appended: Partial<Record<OrderTab, number>> = {};
  if (!result.reused) {
    for (const tab of ORDER_TABS) {
      const list = result.byTab[tab];
      if (!list?.length) continue;
      // Append-only — never clear or rewrite the whole sheet.
      await adapter.appendRows(tab, list.map(toSheetCells));
      appended[tab] = list.length;
    }
  }

  return noStoreJson({
    opId: result.opId,
    reused: result.reused,
    syncedAt,
    inserted: result.inserted.length,
    skipped: result.skipped.length,
    needsReview: result.needsReview.length,
    appended,
    rowResults: result.rowResults,
    note: result.reused
      ? "幂等命中：未再次写入"
      : "已按分类/区域追加到对应工作表（非整表替换）",
  });
}
