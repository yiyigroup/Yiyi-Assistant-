import { z } from "zod";
import { requireApiAccess, noStoreJson } from "@/lib/auth/guard";
import { commitArchive } from "@/lib/archive/commit";
import { getSheetsAdapter } from "@/lib/sheets/client";
import { ARCHIVE_TAB } from "@/lib/config/sheet";
import { assertOrderTab } from "@/lib/sheets/rows";

const candidateSchema = z.object({
  sourceTab: z.string(),
  sourceRow: z.number().int().positive(),
  orderNumber: z.string(),
  customer: z.string(),
  content: z.string(),
  amount: z.string(),
  arrival: z.string(),
  payment: z.string(),
  fulfillment: z.string(),
  region: z.string(),
  testTracking: z.string().optional(),
  originalRowSnapshot: z.string(),
  fingerprint: z.string().min(16),
  shippedConfirmed: z.boolean(),
  paidConfirmed: z.boolean(),
});

const bodySchema = z.object({
  opId: z.string().min(8).max(120),
  confirm: z.literal(true),
  candidates: z.array(candidateSchema).min(1),
  liveFingerprints: z.record(z.string(), z.string()),
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
  if (!parsed.success) return noStoreJson({ error: "Validation failed" }, 422);

  for (const c of parsed.data.candidates) {
    try {
      assertOrderTab(c.sourceTab);
    } catch {
      return noStoreJson({ error: `Invalid source tab: ${c.sourceTab}` }, 422);
    }
  }

  const adapter = getSheetsAdapter();
  const result = await commitArchive(
    {
      opId: parsed.data.opId,
      actorEmail: access.email,
      candidates: parsed.data.candidates,
      liveFingerprints: parsed.data.liveFingerprints,
    },
    {
      append: async (rows) => {
        await adapter.appendRows(ARCHIVE_TAB, rows);
        return { ok: true };
      },
      verifyAppend: async () => true,
      deleteDescending: async (keys) => {
        const byTab = new Map<string, number[]>();
        for (const key of keys) {
          const [tab, row] = key.split("|");
          if (!tab || !row) continue;
          if (!byTab.has(tab)) byTab.set(tab, []);
          byTab.get(tab)!.push(Number(row));
        }
        const failed: string[] = [];
        for (const [tab, rows] of byTab) {
          const res = await adapter.deleteRowsDescending(assertOrderTab(tab), rows);
          for (const n of res.failed) failed.push(`${tab}|${n}`);
        }
        return { ok: failed.length === 0, failed };
      },
    },
  );

  const status =
    result.status === "ok"
      ? 200
      : result.status === "conflict"
        ? 409
        : result.status === "delete_pending"
          ? 202
          : 422;
  return noStoreJson(result, status);
}
