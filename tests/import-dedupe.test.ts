import { describe, expect, it } from "vitest";
import { previewImport, importContentSignature } from "@/lib/import/preview";
import { commitImport } from "@/lib/import/commit";
import { resetMemoryIdempotencyStore } from "@/lib/idempotency/store";
import type { OrderRow } from "@/lib/orders/types";

function baseOrder(partial: Partial<OrderRow> & Pick<OrderRow, "name" | "content">): OrderRow {
  return {
    id: partial.id ?? "x",
    sourceSheet: partial.sourceSheet ?? "导入文件",
    sourceRow: partial.sourceRow ?? 2,
    route: partial.route ?? "待分类",
    name: partial.name,
    phone: partial.phone ?? "",
    phoneKey: partial.phoneKey ?? "",
    zip: partial.zip ?? "",
    address: partial.address ?? "",
    orderNumber: partial.orderNumber ?? "",
    content: partial.content,
    amount: partial.amount ?? null,
    amountRaw: partial.amountRaw ?? "",
    arrivalOriginal: partial.arrivalOriginal ?? "",
    paymentOriginal: partial.paymentOriginal ?? "",
    items: partial.items ?? [],
    issues: partial.issues ?? [],
    originalRow: partial.originalRow ?? [],
  };
}

describe("import dedupe", () => {
  it("detects duplicate row signatures and supports idempotent commit", async () => {
    resetMemoryIdempotencyStore();
    const sheets = [
      {
        name: "邮寄",
        rows: [
          ["到货情况", "付款情况", "序号", "姓名", "内容", "总价"],
          ["到齐", "已付", "1", "Aliya", "外套x1 送货费", "38"],
          ["到齐", "已付", "2", "Aliya", "外套x1 送货费", "38"],
        ],
      },
    ];
    const preview = previewImport({
      fileHash: "abc123",
      sheets,
      existing: [],
      alreadyImportedHashes: new Set(),
    });
    expect(preview.duplicateCount).toBeGreaterThanOrEqual(1);
    expect(preview.appendCount).toBeGreaterThanOrEqual(1);

    const first = await commitImport({ preview });
    const second = await commitImport({ preview });
    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.opId).toBe(first.opId);
    expect(first.byTab["邮寄"]?.length).toBeGreaterThanOrEqual(1);
  });

  it("dedupes by order number against existing sheet rows", () => {
    const sheets = [
      {
        name: "自提",
        rows: [
          ["到货情况", "付款情况", "序号", "姓名", "内容", "总价"],
          ["", "", "A-100", "Mina", "围巾x1 自提", "20"],
        ],
      },
    ];
    const existing = [
      baseOrder({
        id: "live|自提|2",
        name: "Someone",
        content: "other",
        orderNumber: "A-100",
        amountRaw: "1",
        sourceSheet: "自提",
      }),
    ];
    const preview = previewImport({
      fileHash: "hash-on",
      sheets,
      existing,
      alreadyImportedHashes: new Set(),
    });
    expect(preview.duplicateCount).toBe(1);
    expect(preview.appendCount).toBe(0);
    expect(preview.rows[0]?.disposition).toBe("skipped_duplicate");
  });

  it("content signature ignores route so re-read after tab append still matches", () => {
    const a = importContentSignature({
      name: "Aliya",
      content: "外套x1 送货费",
      amountRaw: "38",
    });
    const b = importContentSignature({
      name: "Aliya",
      content: "外套x1 送货费",
      amountRaw: "38",
    });
    expect(a).toBe(b);
  });

  it("returns empty preview when file hash already imported", () => {
    const preview = previewImport({
      fileHash: "done",
      sheets: [],
      existing: [],
      alreadyImportedHashes: new Set(["done"]),
    });
    expect(preview.rows).toHaveLength(0);
    expect(preview.parseErrors[0]?.message).toMatch(/已成功导入/);
  });

  it("routes exact regional ZIP to region tab; conflict fulfillment needs review", () => {
    const sheets = [
      {
        name: "导入文件",
        rows: [
          ["到货情况", "付款情况", "序号", "姓名", "内容", "总价", "地址"],
          ["", "", "R1", "Pat", "果盘x1", "12", "123 Main St 94566"],
          ["", "", "R2", "Sam", "外套x1 自提 送货费", "40", ""],
        ],
      },
    ];
    const preview = previewImport({
      fileHash: "region",
      sheets,
      existing: [],
      alreadyImportedHashes: new Set(),
    });
    const r1 = preview.rows.find((r) => r.order.orderNumber === "R1");
    const r2 = preview.rows.find((r) => r.order.orderNumber === "R2");
    expect(r1?.proposedTab).toBe("三谷");
    expect(r2?.fulfillment).toBe("待确认");
    expect(r2?.disposition).toBe("needs_review");
    expect(r2?.proposedTab).toBeNull();
  });

  it("commit leaves unroutable needs_review out of byTab without fallback", async () => {
    resetMemoryIdempotencyStore();
    const sheets = [
      {
        name: "导入文件",
        rows: [
          ["到货情况", "付款情况", "序号", "姓名", "内容", "总价"],
          ["", "", "U1", "NoTab", "神秘商品x1", "9"],
        ],
      },
    ];
    const preview = previewImport({
      fileHash: "unrouted",
      sheets,
      existing: [],
      alreadyImportedHashes: new Set(),
    });
    expect(preview.rows[0]?.proposedTab).toBeNull();
    const result = await commitImport({ preview });
    expect(result.inserted).toHaveLength(0);
    expect(result.rowResults[0]?.disposition).toBe("needs_review");
    expect(Object.keys(result.byTab)).toHaveLength(0);
  });
});
