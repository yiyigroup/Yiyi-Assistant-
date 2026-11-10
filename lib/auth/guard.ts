import { NextResponse } from "next/server";
import { auth } from "./config";
import { isEmailAllowed } from "./allowlist";
import { requireSameOrigin } from "./origin";

export type GuardOk = {
  ok: true;
  email: string;
};

export type GuardFail = {
  ok: false;
  response: NextResponse;
};

export { requireSameOrigin };

export async function requireSession(): Promise<GuardOk | GuardFail> {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!session || !email) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!isEmailAllowed(email)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, email };
}

export async function requireApiAccess(
  request: Request,
  mutating: boolean,
): Promise<GuardOk | GuardFail> {
  const session = await requireSession();
  if (!session.ok) return session;
  if (mutating) {
    const origin = requireSameOrigin(request);
    if (!origin.ok) return origin;
  }
  return session;
}

export function noStoreJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
