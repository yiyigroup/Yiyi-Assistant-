import { NextResponse } from "next/server";

export type OriginFail = {
  ok: false;
  response: NextResponse;
};

/** Validate Origin for same-origin state-changing requests. */
export function requireSameOrigin(request: Request): OriginFail | { ok: true } {
  const origin = request.headers.get("origin");
  if (!origin) {
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite === "same-origin" || fetchSite === "none") return { ok: true };
    return {
      ok: false,
      response: NextResponse.json({ error: "Missing Origin" }, { status: 403 }),
    };
  }
  const host = request.headers.get("host");
  try {
    const o = new URL(origin);
    if (host && o.host === host) return { ok: true };
  } catch {
    /* fall through */
  }
  return {
    ok: false,
    response: NextResponse.json({ error: "Invalid Origin" }, { status: 403 }),
  };
}
