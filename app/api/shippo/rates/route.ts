import { z } from "zod";
import { requireApiAccess, noStoreJson } from "@/lib/auth/guard";
import { getTestRates } from "@/lib/shippo/rates";

const addressSchema = z.object({
  name: z.string().min(1).max(120),
  street1: z.string().min(1).max(180),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(30),
  zip: z.string().min(1).max(20),
  country: z.literal("US"),
  phone: z.string().max(50).optional(),
});

const parcelSchema = z.object({
  length: z.number().positive().lt(2000),
  width: z.number().positive().lt(2000),
  height: z.number().positive().lt(2000),
  weight: z.number().positive().lt(2000),
  distance_unit: z.literal("in"),
  mass_unit: z.literal("kg"),
});

const bodySchema = z.object({
  from: addressSchema,
  to: addressSchema,
  parcel: parcelSchema,
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
    return noStoreJson(
      {
        error:
          "Complete the sender, recipient, and positive package measurements. US addresses only.",
      },
      422,
    );
  }

  try {
    const result = await getTestRates({
      token: process.env.SHIPPO_TEST_TOKEN || "",
      ...parsed.data,
    });
    return noStoreJson(result);
  } catch (e) {
    const status = (e as { status?: number }).status;
    return noStoreJson(
      { error: e instanceof Error ? e.message : "Shippo request failed" },
      status && status >= 400 && status < 500 ? 422 : 502,
    );
  }
}
