import { z } from "zod";
import { requireApiAccess, noStoreJson } from "@/lib/auth/guard";
import { sha256Hex } from "@/lib/idempotency/hash";
import { memoryIdempotencyStore } from "@/lib/idempotency/store";
import { parseImportFile } from "@/lib/import/file";
import { previewImport } from "@/lib/import/preview";
import { getSheetsAdapter } from "@/lib/sheets/client";
import { loadOrdersFromSheets } from "@/lib/sheets/rows";

const bodySchema = z.object({
  filename: z.string().min(1).max(240),
  contentBase64: z.string().min(1),
});

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

  const buf = Buffer.from(parsed.data.contentBase64, "base64");
  const fileHash = sha256Hex(buf);

  let sheets;
  let format: "csv" | "xlsx";
  try {
    const file = parseImportFile({ filename: parsed.data.filename, buffer: buf });
    sheets = file.sheets;
    format = file.format;
  } catch (e) {
    return noStoreJson(
      { error: e instanceof Error ? e.message : "无法解析文件" },
      422,
    );
  }

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

  return noStoreJson({
    format,
    syncedAt,
    preview: {
      fileHash: preview.fileHash,
      ignoredSheets: preview.ignoredSheets,
      parseErrors: preview.parseErrors,
      insertCount: preview.insertCount,
      duplicateCount: preview.duplicateCount,
      reviewCount: preview.reviewCount,
      appendCount: preview.appendCount,
      samples: {
        insert: preview.rows
          .filter((r) => r.disposition === "insert")
          .slice(0, 8)
          .map(serializeRow),
        duplicate: preview.rows
          .filter((r) => r.disposition === "skipped_duplicate")
          .slice(0, 8)
          .map(serializeRow),
        needsReview: preview.rows
          .filter((r) => r.disposition === "needs_review")
          .slice(0, 8)
          .map(serializeRow),
      },
      rows: preview.rows.map(serializeRow),
    },
    note: "仅预览 — 确认导入后才会追加写入 Sheet，不会整表替换",
  });
}

function serializeRow(r: {
  disposition: string;
  proposedTab: string | null;
  fulfillment: string;
  tabReason: string;
  regionNote: string | null;
  order: {
    id: string;
    name: string;
    content: string;
    orderNumber: string;
    issues: string[];
    sourceSheet: string;
    sourceRow: number;
    amountRaw: string;
    zip: string;
  };
}) {
  return {
    disposition: r.disposition,
    id: r.order.id,
    name: r.order.name,
    content: r.order.content,
    orderNumber: r.order.orderNumber,
    amountRaw: r.order.amountRaw,
    issues: r.order.issues,
    sourceSheet: r.order.sourceSheet,
    sourceRow: r.order.sourceRow,
    proposedTab: r.proposedTab,
    fulfillment: r.fulfillment,
    tabReason: r.tabReason,
    regionNote: r.regionNote,
    zip: r.order.zip,
  };
}
