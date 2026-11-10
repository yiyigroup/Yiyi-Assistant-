import { describe, expect, it, beforeEach } from "vitest";
import { createMockSheets, resetSheetsAdapterCache } from "@/lib/sheets/client";
import { buildStatusCellUpdates, applyOrderStatusUpdate } from "@/lib/orders/status-update";
import { orderFingerprint } from "@/lib/sheets/rows";
import { resetMemoryIdempotencyStore, memoryIdempotencyStore } from "@/lib/idempotency/store";
import { orderStatusBodySchema } from "@/lib/orders/status-schema";
import { mapWorkbook } from "@/lib/import/parse";

const HEADERS = ["到货情况", "付款情况", "序号", "姓名", "内容", "总价"];

function seedAdapter() {
  return createMockSheets({
    自提: [
      HEADERS,
      ["未到", "未付", "1", "Amy", "饼干x2 自提", "16"],
      ["到齐", "已付", "2", "Ben", "牛奶x1 自提", "8"],
    ],
    邮寄: [HEADERS],
    三谷: [HEADERS],
    "95008": [HEADERS],
    shippo: [["carrier", "fee"]],
  });
}

async function liveOrder(adapter: ReturnType<typeof createMockSheets>, row = 2) {
  const rows = await adapter.readRange("自提", "A1:AZ5000");
  const { orders } = mapWorkbook([{ name: "自提", rows }], "live-sheet");
  const order = orders.find((o) => o.sourceRow === row);
  if (!order) throw new Error("seed row missing");
  order.id = `live|自提|${order.sourceRow}`;
  return order;
}

describe("status update mapping", () => {
  it("maps arrival/payment via header aliases to A1 cells", () => {
    const patches = buildStatusCellUpdates({
      headers: ["付款状态", "客户姓名", "到货状态", "内容"],
      sourceRow: 4,
      arrival: "到齐",
      payment: "已付",
    });
    expect(patches).toEqual([
      { field: "arrival", a1: "C4", value: "到齐" },
      { field: "payment", a1: "A4", value: "已付" },
    ]);
  });

  it("only includes requested fields so other columns stay untouched", () => {
    const patches = buildStatusCellUpdates({
      headers: HEADERS,
      sourceRow: 2,
      arrival: "到齐",
    });
    expect(patches).toEqual([{ field: "arrival", a1: "A2", value: "到齐" }]);
  });

  it("throws when required status column is missing", () => {
    expect(() =>
      buildStatusCellUpdates({
        headers: ["序号", "姓名", "内容"],
        sourceRow: 2,
        payment: "已付",
      }),
    ).toThrow(/Payment column not found/);
  });
});

describe("confirm-required path", () => {
  it("rejects body without confirm: true", () => {
    const parsed = orderStatusBodySchema.safeParse({
      opId: "status-op-12345",
      sourceTab: "自提",
      sourceRow: 2,
      expectedFingerprint: "a".repeat(32),
      arrival: "到齐",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects confirm true with neither arrival nor payment", () => {
    const parsed = orderStatusBodySchema.safeParse({
      opId: "status-op-12345",
      sourceTab: "自提",
      sourceRow: 2,
      expectedFingerprint: "a".repeat(32),
      confirm: true,
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts explicit confirm with a status field", () => {
    const parsed = orderStatusBodySchema.safeParse({
      opId: "status-op-12345",
      sourceTab: "自提",
      sourceRow: 2,
      expectedFingerprint: "a".repeat(32),
      arrival: "到齐",
      confirm: true,
    });
    expect(parsed.success).toBe(true);
  });

  it("applyOrderStatusUpdate refuses confirm !== true", async () => {
    const adapter = seedAdapter();
    const result = await applyOrderStatusUpdate(adapter, {
      opId: "status-op-refuse",
      sourceTab: "自提",
      sourceRow: 2,
      expectedFingerprint: "a".repeat(32),
      arrival: "到齐",
      // @ts-expect-error intentional invalid confirm for runtime guard
      confirm: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/confirm/i);
  });
});

describe("fingerprint conflict and write-back", () => {
  beforeEach(() => {
    resetMemoryIdempotencyStore();
    resetSheetsAdapterCache();
  });

  it("writes arrival/payment with RAW cell updates and returns new fingerprint", async () => {
    const adapter = seedAdapter();
    const order = await liveOrder(adapter, 2);
    const fp = orderFingerprint(order);

    const result = await applyOrderStatusUpdate(
      adapter,
      {
        opId: "status-op-write-1",
        sourceTab: "自提",
        sourceRow: 2,
        expectedFingerprint: fp,
        arrival: "到齐",
        payment: "已付",
        confirm: true,
      },
      { store: memoryIdempotencyStore },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.arrival).toBe("到齐");
    expect(result.payment).toBe("已付");
    expect(result.fingerprint).not.toBe(fp);
    expect(result.reused).toBe(false);

    const rows = await adapter.readRange("自提", "A1:AZ5000");
    // Non-updated cells (name/content/amount) remain.
    expect(rows[1]).toEqual(["到齐", "已付", "1", "Amy", "饼干x2 自提", "16"]);
  });

  it("rejects on fingerprint mismatch without writing", async () => {
    const adapter = seedAdapter();
    const before = await adapter.readRange("自提", "A1:AZ5000");

    const result = await applyOrderStatusUpdate(
      adapter,
      {
        opId: "status-op-conflict-1",
        sourceTab: "自提",
        sourceRow: 2,
        expectedFingerprint: "f".repeat(64),
        arrival: "到齐",
        confirm: true,
      },
      { store: memoryIdempotencyStore },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Fingerprint conflict");
    const after = await adapter.readRange("自提", "A1:AZ5000");
    expect(after).toEqual(before);
  });

  it("idempotent retry returns cached success without double-writing", async () => {
    const adapter = seedAdapter();
    const order = await liveOrder(adapter, 2);
    const fp = orderFingerprint(order);
    const input = {
      opId: "status-op-idem-1",
      sourceTab: "自提" as const,
      sourceRow: 2,
      expectedFingerprint: fp,
      arrival: "部分到货",
      confirm: true as const,
    };

    const first = await applyOrderStatusUpdate(adapter, input, { store: memoryIdempotencyStore });
    expect(first.ok).toBe(true);

    // Mutate sheet underneath — a non-idempotent second write with old fingerprint would conflict.
    await adapter.updateCells("自提", [{ a1: "A2", value: "被别人改了" }]);

    const second = await applyOrderStatusUpdate(adapter, input, { store: memoryIdempotencyStore });
    expect(second.ok).toBe(true);
    if (!second.ok || !first.ok) return;
    expect(second.reused).toBe(true);
    expect(second.arrival).toBe(first.arrival);
    expect(second.fingerprint).toBe(first.fingerprint);

    // Cached replay must not have re-applied the write over the external change's other fields,
    // but A2 may still show the external change because we skipped the write path entirely.
    const rows = await adapter.readRange("自提", "A1:AZ5000");
    expect(rows[1]![0]).toBe("被别人改了");
  });
});
