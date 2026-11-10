import { z } from "zod";
import { requireApiAccess, noStoreJson } from "@/lib/auth/guard";
import { planArchiveInitialize, ARCHIVE_HEADERS } from "@/lib/archive/initialize";
import { getSheetsAdapter } from "@/lib/sheets/client";

const bodySchema = z.object({
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
  if (!parsed.success) return noStoreJson({ error: "Confirmation required" }, 422);

  const adapter = getSheetsAdapter();
  const tabs = await adapter.listTabs();
  const plan = planArchiveInitialize(tabs);
  if (plan.status === "created") {
    await adapter.createTab("完成记录", [...ARCHIVE_HEADERS]);
  }
  return noStoreJson(plan);
}
