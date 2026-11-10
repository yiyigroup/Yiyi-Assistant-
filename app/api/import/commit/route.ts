import { z } from "zod";
import { requireApiAccess, noStoreJson } from "@/lib/auth/guard";
import { sha256Hex } from "@/lib/idempotency/hash";
import { previewImport, sheetsFromCsvText } from "@/lib/import/preview";
import { commitImport } from "@/lib/import/commit";
import { getSheetsAdapter } from "@/lib/sheets/client";
import { loadOrdersFromSheets } from "@/lib/sheets/rows";
import { assertOrderTab } from "@/lib/sheets/rows";
import { isOrderTab } from "@/lib/config/sheet";

const bodySchema = z.object({
  filename: z.string().min(1).max(240),
  contentBase64: z.string().min(1),
  targetTab: z.string(),
  confirm: z.literal(true),
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
  if (!isOrderTab(parsed.data.targetTab)) {
    return noStoreJson({ error: "Invalid target tab" }, 422);
  }

  const buf = Buffer.from(parsed.data.contentBase64, "base64");
  const fileHash = sha256Hex(buf);
  const adapter = getSheetsAdapter();
  const { orders: existing } = await loadOrdersFromSheets(adapter);
  const preview = previewImport({
    fileHash,
    sheets: sheetsFromCsvText(buf.toString("utf8")),
    existing,
    alreadyImportedHashes: new Set(),
  });
  const result = await commitImport({ preview });

  if (!result.reused) {
    const tab = assertOrderTab(parsed.data.targetTab);
    const rows = result.inserted.map((o) => [
      o.arrivalOriginal,
      o.paymentOriginal,
      o.orderNumber,
      o.name,
      o.content,
      o.amountRaw,
      ...o.originalRow.slice(6),
    ]);
    if (rows.length) await adapter.appendRows(tab, rows);
  }

  return noStoreJson({
    opId: result.opId,
    inserted: result.inserted.length,
    skipped: result.skipped.length,
    needsReview: result.needsReview.length,
    reused: result.reused,
  });
}
