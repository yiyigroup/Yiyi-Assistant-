import { requireApiAccess, noStoreJson } from "@/lib/auth/guard";
import { isConfiguredTestToken } from "@/lib/shippo/client";

export async function GET(request: Request) {
  const access = await requireApiAccess(request, false);
  if (!access.ok) return access.response;

  return noStoreJson({
    configured: isConfiguredTestToken(process.env.SHIPPO_TEST_TOKEN),
    mode: "test",
    liveDisabled: true,
  });
}
