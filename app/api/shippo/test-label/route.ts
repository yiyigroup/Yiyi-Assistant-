import { z } from "zod";
import { requireApiAccess, noStoreJson } from "@/lib/auth/guard";
import { createTestLabel } from "@/lib/shippo/rates";

const bodySchema = z.object({
  rate_id: z.string().min(1).max(100),
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
  if (!parsed.success) return noStoreJson({ error: "Select an existing test rate first" }, 422);

  try {
    const result = await createTestLabel({
      token: process.env.SHIPPO_TEST_TOKEN || "",
      rateId: parsed.data.rate_id,
    });
    return noStoreJson(result);
  } catch (e) {
    return noStoreJson({ error: e instanceof Error ? e.message : "Shippo request failed" }, 502);
  }
}
