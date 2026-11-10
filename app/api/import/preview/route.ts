import { z } from "zod";
import { requireApiAccess, noStoreJson } from "@/lib/auth/guard";
import { sha256Hex } from "@/lib/idempotency/hash";
import { previewImport, sheetsFromCsvText } from "@/lib/import/preview";
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
  const text = buf.toString("utf8");

  // CSV path for preview; XLSX parsing remains client-assisted in UI then posted as CSV rows later.
  if (!/\.csv$/i.test(parsed.data.filename) && !text.includes(",")) {
    return noStoreJson(
      {
        error: "Server preview currently accepts CSV. Convert XLSX client-side or upload CSV.",
      },
      422,
    );
  }

  const adapter = getSheetsAdapter();
  const { orders: existing } = await loadOrdersFromSheets(adapter);
  const preview = previewImport({
    fileHash,
    sheets: sheetsFromCsvText(text),
    existing,
    alreadyImportedHashes: new Set(),
  });

  return noStoreJson({
    preview: {
      ...preview,
      rows: preview.rows.map((r) => ({
        disposition: r.disposition,
        id: r.order.id,
        name: r.order.name,
        content: r.order.content,
        issues: r.order.issues,
        sourceSheet: r.order.sourceSheet,
        sourceRow: r.order.sourceRow,
      })),
    },
    note: "Preview only — write requires Confirm Import on /api/import/commit",
  });
}
