export type IdempotencyRecord = {
  key: string;
  op: string;
  createdAt: string;
  result: unknown;
};

/** In-memory / KV-ready interface. Swap for durable store in production later. */
export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | null>;
  put(record: IdempotencyRecord): Promise<void>;
}

const memory = new Map<string, IdempotencyRecord>();

export const memoryIdempotencyStore: IdempotencyStore = {
  async get(key) {
    return memory.get(key) ?? null;
  },
  async put(record) {
    memory.set(record.key, record);
  },
};

export function resetMemoryIdempotencyStore(): void {
  memory.clear();
}
