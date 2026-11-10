import { describe, expect, it } from "vitest";
import { previewImport } from "@/lib/import/preview";
import { commitImport } from "@/lib/import/commit";
import { resetMemoryIdempotencyStore } from "@/lib/idempotency/store";

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

    const first = await commitImport({ preview });
    const second = await commitImport({ preview });
    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.opId).toBe(first.opId);
  });
});
