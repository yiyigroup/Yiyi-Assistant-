import { requireApiAccess, noStoreJson } from "@/lib/auth/guard";
import { getSheetsAdapter } from "@/lib/sheets/client";
import { memoryIdempotencyStore } from "@/lib/idempotency/store";
import { applyOrderStatusUpdate } from "@/lib/orders/status-update";
import { orderStatusBodySchema } from "@/lib/orders/status-schema";

export async function POST(request: Request) {
  const access = await requireApiAccess(request, true);
  if (!access.ok) return access.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return noStoreJson({ error: "Invalid JSON" }, 400);
  }
  const parsed = orderStatusBodySchema.safeParse(json);
  if (!parsed.success) {
    return noStoreJson({ error: "Validation failed", details: parsed.error.flatten() }, 422);
  }

  try {
    const adapter = getSheetsAdapter();
    const result = await applyOrderStatusUpdate(adapter, parsed.data, {
      store: memoryIdempotencyStore,
    });

    if (!result.ok) {
      if (result.error === "Fingerprint conflict" && "liveFingerprint" in result) {
        return noStoreJson(
          {
            error: result.error,
            liveFingerprint: result.liveFingerprint,
            arrival: result.arrival,
            payment: result.payment,
            order: result.order,
          },
          409,
        );
      }
      if (result.error === "Row not found" || result.error === "Row not found after write") {
        return noStoreJson({ error: result.error }, 404);
      }
      return noStoreJson({ error: result.error }, 400);
    }

    return noStoreJson({
      ok: true,
      opId: result.opId,
      sourceTab: result.sourceTab,
      sourceRow: result.sourceRow,
      arrival: result.arrival,
      payment: result.payment,
      fingerprint: result.fingerprint,
      order: result.order,
      reused: result.reused,
    });
  } catch (e) {
    return noStoreJson({ error: e instanceof Error ? e.message : "Status update failed" }, 400);
  }
}
