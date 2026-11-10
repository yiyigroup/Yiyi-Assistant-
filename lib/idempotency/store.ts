export type IdempotencyRecord = {
  key: string;
  op: string;
  createdAt: string;
  result: unknown;
  /** complete = durable success for this process; pending reserved for future KV. */
  status?: "pending" | "complete";
};

/**
 * In-memory / KV-ready interface.
 *
 * Vercel limits (current default = process memory):
 * - Survives retries on the **same** warm instance (plus in-flight coalescing via runIdempotent).
 * - Lost on cold start / new isolate — clients must keep the same opId; Sheet fingerprint
 *   still blocks blind overwrite if a prior write already landed.
 * - Not shared across concurrent isolates. Swap for Vercel KV / Upstash / DB when available.
 */
export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | null>;
  put(record: IdempotencyRecord): Promise<void>;
  /** Remove a key (e.g. drop pending after a non-cacheable outcome). */
  delete?(key: string): Promise<void>;
}

const memory = new Map<string, IdempotencyRecord>();

export const memoryIdempotencyStore: IdempotencyStore = {
  async get(key) {
    return memory.get(key) ?? null;
  },
  async put(record) {
    memory.set(record.key, { ...record, status: record.status ?? "complete" });
  },
  async delete(key) {
    memory.delete(key);
  },
};

/** Same-isolate in-flight map so concurrent retries with one opId share one write. */
const inflight = new Map<string, Promise<unknown>>();

export function resetMemoryIdempotencyStore(): void {
  memory.clear();
  inflight.clear();
}

function isCacheableSuccess(result: unknown): boolean {
  return (
    result != null &&
    typeof result === "object" &&
    "ok" in result &&
    (result as { ok: unknown }).ok === true
  );
}

/**
 * Run `fn` once per op key on this isolate.
 * Completed success records are reused; concurrent callers await the same promise.
 * Conflicts / not-found are not cached so the operator can re-read and retry.
 */
export async function runIdempotent<T>(
  store: IdempotencyStore,
  key: string,
  op: string,
  fn: () => Promise<T>,
): Promise<{ result: T; reused: boolean }> {
  const existing = await store.get(key);
  if (existing && existing.status !== "pending") {
    return { result: existing.result as T, reused: true };
  }

  const active = inflight.get(key) as Promise<T> | undefined;
  if (active) {
    return { result: await active, reused: true };
  }

  const promise = (async () => {
    await store.put({
      key,
      op,
      createdAt: new Date().toISOString(),
      result: null,
      status: "pending",
    });
    try {
      const result = await fn();
      if (isCacheableSuccess(result)) {
        await store.put({
          key,
          op,
          createdAt: new Date().toISOString(),
          result,
          status: "complete",
        });
      } else if (store.delete) {
        await store.delete(key);
      }
      return result;
    } catch (e) {
      if (store.delete) await store.delete(key);
      throw e;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return { result: await promise, reused: false };
}
