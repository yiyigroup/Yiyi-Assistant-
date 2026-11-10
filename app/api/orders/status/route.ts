import { z } from "zod";
import { requireApiAccess, noStoreJson } from "@/lib/auth/guard";
import { assertOrderTab } from "@/lib/sheets/rows";
import { orderFingerprint } from "@/lib/sheets/rows";
import { getSheetsAdapter } from "@/lib/sheets/client";
import { loadOrdersFromSheets } from "@/lib/sheets/rows";
import { memoryIdempotencyStore } from "@/lib/idempotency/store";

const bodySchema = z.object({
  opId: z.string().min(8).max(120),
  sourceTab: z.string(),
  sourceRow: z.number().int().positive(),
  expectedFingerprint: z.string().min(16),
  arrival: z.string().max(200).optional(),
  payment: z.string().max(200).optional(),
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
  if (!parsed.success) {
    return noStoreJson({ error: "Validation failed", details: parsed.error.flatten() }, 422);
  }

  const prior = await memoryIdempotencyStore.get(parsed.data.opId);
  if (prior) return noStoreJson({ ...(prior.result as object), reused: true });

  try {
    const tab = assertOrderTab(parsed.data.sourceTab);
    const adapter = getSheetsAdapter();
    const { orders } = await loadOrdersFromSheets(adapter);
    const live = orders.find((o) => o.sourceSheet === tab && o.sourceRow === parsed.data.sourceRow);
    if (!live) return noStoreJson({ error: "Row not found" }, 404);
    const fp = orderFingerprint(live);
    if (fp !== parsed.data.expectedFingerprint) {
      return noStoreJson({ error: "Fingerprint conflict", liveFingerprint: fp }, 409);
    }

    // Status writes are planned against Sheet columns; mock adapter stores via append log for now.
    const result = {
      ok: true,
      opId: parsed.data.opId,
      sourceTab: tab,
      sourceRow: parsed.data.sourceRow,
      arrival: parsed.data.arrival ?? live.arrivalOriginal,
      payment: parsed.data.payment ?? live.paymentOriginal,
      reused: false,
    };
    await memoryIdempotencyStore.put({
      key: parsed.data.opId,
      op: "orders.status",
      createdAt: new Date().toISOString(),
      result,
    });
    return noStoreJson(result);
  } catch (e) {
    return noStoreJson({ error: e instanceof Error ? e.message : "Status update failed" }, 400);
  }
}
