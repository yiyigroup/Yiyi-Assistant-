export type ShippoAddress = {
  name: string;
  street1: string;
  city: string;
  state: string;
  zip: string;
  country: "US";
  phone?: string;
};

export type ShippoParcel = {
  length: number;
  width: number;
  height: number;
  weight: number;
  distance_unit: "in";
  mass_unit: "kg";
};

export function assertTestShippoToken(token: string | undefined): string {
  if (typeof token !== "string" || !token.startsWith("shippo_test_") || token.length <= 20) {
    throw new Error(
      "Shippo test token is not configured. A shippo_test_ token must be installed as a server secret.",
    );
  }
  if (token.startsWith("shippo_live_")) {
    throw new Error("Live Shippo tokens are refused");
  }
  return token;
}

export function isConfiguredTestToken(token: string | undefined): boolean {
  try {
    assertTestShippoToken(token);
    return true;
  } catch {
    return false;
  }
}

function validString(v: unknown, max = 180): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max;
}

export function validateAddress(a: unknown): a is ShippoAddress {
  if (!a || typeof a !== "object") return false;
  const o = a as ShippoAddress;
  return (
    validString(o.name, 120) &&
    validString(o.street1, 180) &&
    validString(o.city, 100) &&
    validString(o.state, 30) &&
    validString(o.zip, 20) &&
    o.country === "US" &&
    (!o.phone || validString(o.phone, 50))
  );
}

export function validateParcel(p: unknown): p is ShippoParcel {
  if (!p || typeof p !== "object") return false;
  const o = p as ShippoParcel;
  return (
    ["length", "width", "height", "weight"].every((k) => {
      const n = (o as Record<string, unknown>)[k];
      return typeof n === "number" && Number.isFinite(n) && n > 0 && n < 2000;
    }) &&
    o.distance_unit === "in" &&
    o.mass_unit === "kg"
  );
}

const API = "https://api.goshippo.com";

export async function shippoPost<T>(
  token: string,
  path: string,
  body: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const safe = assertTestShippoToken(token);
  const response = await fetchImpl(API + path, {
    method: "POST",
    headers: {
      authorization: "ShippoToken " + safe,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({
    message: "Shippo returned unreadable response",
  }))) as T & { message?: string };
  if (!response.ok) {
    throw Object.assign(
      new Error(typeof data?.message === "string" ? data.message : "Shippo request failed"),
      {
        status: response.status,
      },
    );
  }
  return data;
}

export function assertWasTest(result: { was_test?: boolean }): void {
  if (result.was_test !== true) {
    throw new Error("Shippo did not confirm a test transaction. Label details withheld.");
  }
}
