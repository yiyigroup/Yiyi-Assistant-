import { fingerprintsMatch } from "@/lib/orders/fingerprint";
import { memoryIdempotencyStore, type IdempotencyStore } from "@/lib/idempotency/store";

export type ArchiveCandidate = {
  sourceTab: string;
  sourceRow: number;
  orderNumber: string;
  customer: string;
  content: string;
  amount: string;
  arrival: string;
  payment: string;
  fulfillment: string;
  region: string;
  testTracking?: string;
  originalRowSnapshot: string;
  fingerprint: string;
  /** Must be shipped + paid confirmed before archive. */
  shippedConfirmed: boolean;
  paidConfirmed: boolean;
};

export type ArchiveCommitInput = {
  opId: string;
  actorEmail: string;
  candidates: ArchiveCandidate[];
  /** Re-read fingerprints keyed by `${tab}|${row}` */
  liveFingerprints: Record<string, string>;
};

export type ArchiveCommitResult =
  | {
      status: "ok";
      opId: string;
      archived: number;
      deleted: number;
      reused: boolean;
    }
  | { status: "conflict"; opId: string; conflicts: string[] }
  | { status: "ineligible"; opId: string; reasons: string[] }
  | {
      status: "delete_pending";
      opId: string;
      archived: number;
      pendingDeletes: string[];
      reused: boolean;
    };

/**
 * Append-first archive state machine:
 * re-read → verify fingerprints/eligibility → append → verify → delete descending → resume op ID.
 */
export async function commitArchive(
  input: ArchiveCommitInput,
  opts?: {
    store?: IdempotencyStore;
    append: (rows: string[][]) => Promise<{ ok: boolean }>;
    deleteDescending: (keys: string[]) => Promise<{ ok: boolean; failed?: string[] }>;
    verifyAppend: (opId: string, count: number) => Promise<boolean>;
  },
): Promise<ArchiveCommitResult> {
  const store = opts?.store ?? memoryIdempotencyStore;
  const prior = await store.get(input.opId);
  if (prior?.result) {
    return { ...(prior.result as ArchiveCommitResult), reused: true } as ArchiveCommitResult;
  }

  const reasons: string[] = [];
  for (const c of input.candidates) {
    if (!c.shippedConfirmed || !c.paidConfirmed) {
      reasons.push(`${c.sourceTab}|${c.sourceRow}: not shipped+paid`);
    }
  }
  if (reasons.length) return { status: "ineligible", opId: input.opId, reasons };

  const conflicts: string[] = [];
  for (const c of input.candidates) {
    const key = `${c.sourceTab}|${c.sourceRow}`;
    const live = input.liveFingerprints[key] ?? "";
    if (!fingerprintsMatch(c.fingerprint, live)) conflicts.push(key);
  }
  if (conflicts.length) return { status: "conflict", opId: input.opId, conflicts };

  const timestamp = new Date().toISOString();
  const rows = input.candidates.map((c) => [
    timestamp,
    input.opId,
    input.actorEmail,
    c.sourceTab,
    String(c.sourceRow),
    c.orderNumber,
    c.customer,
    c.content,
    c.amount,
    c.arrival,
    c.payment,
    c.fulfillment,
    c.region,
    c.testTracking ?? "",
    c.originalRowSnapshot,
  ]);

  const append = opts?.append ?? (async () => ({ ok: true }));
  const verifyAppend = opts?.verifyAppend ?? (async () => true);
  const deleteDescending = opts?.deleteDescending ?? (async () => ({ ok: true as const }));

  const appended = await append(rows);
  if (!appended.ok) {
    return { status: "ineligible", opId: input.opId, reasons: ["append failed"] };
  }
  const verified = await verifyAppend(input.opId, rows.length);
  if (!verified) {
    return {
      status: "ineligible",
      opId: input.opId,
      reasons: ["archive verify failure — active rows not deleted"],
    };
  }

  const keys = [...input.candidates]
    .sort((a, b) => b.sourceRow - a.sourceRow)
    .map((c) => `${c.sourceTab}|${c.sourceRow}`);
  const deleted = await deleteDescending(keys);
  if (!deleted.ok) {
    const result: ArchiveCommitResult = {
      status: "delete_pending",
      opId: input.opId,
      archived: rows.length,
      pendingDeletes: deleted.failed ?? keys,
      reused: false,
    };
    await store.put({
      key: input.opId,
      op: "archive.commit",
      createdAt: timestamp,
      result,
    });
    return result;
  }

  const result: ArchiveCommitResult = {
    status: "ok",
    opId: input.opId,
    archived: rows.length,
    deleted: keys.length,
    reused: false,
  };
  await store.put({
    key: input.opId,
    op: "archive.commit",
    createdAt: timestamp,
    result,
  });
  return result;
}
