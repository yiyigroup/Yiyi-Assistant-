import { describe, expect, it } from "vitest";
import { commitArchive, type ArchiveCandidate } from "@/lib/archive/commit";
import { planArchiveInitialize } from "@/lib/archive/initialize";
import { resetMemoryIdempotencyStore } from "@/lib/idempotency/store";

function candidate(partial?: Partial<ArchiveCandidate>): ArchiveCandidate {
  return {
    sourceTab: "邮寄",
    sourceRow: 5,
    orderNumber: "1",
    customer: "A",
    content: "x",
    amount: "10",
    arrival: "到齐",
    payment: "已付",
    fulfillment: "邮寄",
    region: "",
    originalRowSnapshot: "[]",
    fingerprint: "f".repeat(32),
    shippedConfirmed: true,
    paidConfirmed: true,
    ...partial,
  };
}

describe("archive", () => {
  it("initializes 完成记录 without reusing shippo", () => {
    const plan = planArchiveInitialize(["自提", "邮寄", "shippo"]);
    expect(plan.status).toBe("created");
  });

  it("append-before-delete and resumes op id after delete failure", async () => {
    resetMemoryIdempotencyStore();
    const fp = "a".repeat(32);
    const c = candidate({ fingerprint: fp, sourceRow: 5 });
    const first = await commitArchive(
      {
        opId: "arch-1",
        actorEmail: "ops@example.com",
        candidates: [c],
        liveFingerprints: { "邮寄|5": fp },
      },
      {
        append: async () => ({ ok: true }),
        verifyAppend: async () => true,
        deleteDescending: async () => ({ ok: false, failed: ["邮寄|5"] }),
      },
    );
    expect(first.status).toBe("delete_pending");

    const second = await commitArchive(
      {
        opId: "arch-1",
        actorEmail: "ops@example.com",
        candidates: [c],
        liveFingerprints: { "邮寄|5": fp },
      },
      {
        append: async () => ({ ok: true }),
        verifyAppend: async () => true,
        deleteDescending: async () => ({ ok: true }),
      },
    );
    expect(second).toMatchObject({ status: "delete_pending", reused: true });
  });

  it("conflicts when fingerprint changes; fails verify before delete", async () => {
    resetMemoryIdempotencyStore();
    const conflict = await commitArchive({
      opId: "arch-2",
      actorEmail: "ops@example.com",
      candidates: [candidate({ fingerprint: "b".repeat(32) })],
      liveFingerprints: { "邮寄|5": "c".repeat(32) },
    });
    expect(conflict.status).toBe("conflict");

    resetMemoryIdempotencyStore();
    const verifyFail = await commitArchive(
      {
        opId: "arch-3",
        actorEmail: "ops@example.com",
        candidates: [candidate({ fingerprint: "d".repeat(32) })],
        liveFingerprints: { "邮寄|5": "d".repeat(32) },
      },
      {
        append: async () => ({ ok: true }),
        verifyAppend: async () => false,
        deleteDescending: async () => {
          throw new Error("should not delete");
        },
      },
    );
    expect(verifyFail.status).toBe("ineligible");
  });

  it("rejects when not shipped+paid", async () => {
    resetMemoryIdempotencyStore();
    const res = await commitArchive({
      opId: "arch-4",
      actorEmail: "ops@example.com",
      candidates: [candidate({ shippedConfirmed: false })],
      liveFingerprints: { "邮寄|5": "f".repeat(32) },
    });
    expect(res.status).toBe("ineligible");
  });
});
