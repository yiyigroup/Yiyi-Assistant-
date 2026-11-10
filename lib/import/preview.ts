import { rowSignature } from "@/lib/idempotency/hash";
import type { OrderRow } from "@/lib/orders/types";
import { mapWorkbook, parseCsv, type SheetData } from "./parse";

export type ImportPreviewRow = {
  order: OrderRow;
  disposition: "insert" | "skipped_duplicate" | "needs_review";
};

export type ImportPreview = {
  fileHash: string;
  ignoredSheets: string[];
  rows: ImportPreviewRow[];
  insertCount: number;
  duplicateCount: number;
  reviewCount: number;
};

export function previewImport(args: {
  fileHash: string;
  sheets: SheetData[];
  existing: OrderRow[];
  alreadyImportedHashes: Set<string>;
}): ImportPreview {
  if (args.alreadyImportedHashes.has(args.fileHash)) {
    return {
      fileHash: args.fileHash,
      ignoredSheets: [],
      rows: [],
      insertCount: 0,
      duplicateCount: 0,
      reviewCount: 0,
    };
  }
  const parsed = mapWorkbook(args.sheets, args.fileHash);
  const existingSigs = new Set(
    args.existing.map((o) =>
      rowSignature({
        name: o.name,
        route: o.route,
        content: o.content,
        amountRaw: o.amountRaw,
      }),
    ),
  );
  const seen = new Set<string>();
  const rows: ImportPreviewRow[] = [];
  for (const order of parsed.orders) {
    const sig = rowSignature({
      name: order.name,
      route: order.route,
      content: order.content,
      amountRaw: order.amountRaw,
    });
    let disposition: ImportPreviewRow["disposition"] = "insert";
    if (existingSigs.has(sig) || seen.has(sig) || args.existing.some((o) => o.id === order.id)) {
      disposition = "skipped_duplicate";
      order.issues.push("与另一笔订单的客户、商品和金额相同，可能重复导入，请核对原始订单号");
    } else if (order.issues.length) {
      disposition = "needs_review";
    }
    seen.add(sig);
    rows.push({ order, disposition });
  }
  return {
    fileHash: args.fileHash,
    ignoredSheets: parsed.ignored,
    rows,
    insertCount: rows.filter((r) => r.disposition === "insert" || r.disposition === "needs_review")
      .length,
    duplicateCount: rows.filter((r) => r.disposition === "skipped_duplicate").length,
    reviewCount: rows.filter((r) => r.disposition === "needs_review").length,
  };
}

export function sheetsFromCsvText(text: string): SheetData[] {
  return parseCsv(text);
}
