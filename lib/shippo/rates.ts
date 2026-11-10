import {
  assertTestShippoToken,
  assertWasTest,
  shippoPost,
  validateAddress,
  validateParcel,
  type ShippoAddress,
  type ShippoParcel,
} from "./client";

export type RateQuote = {
  id: string;
  provider: string;
  service: string;
  amount: string;
  currency: string;
  days?: number;
};

type ShippoShipment = {
  object_id: string;
  rates?: Array<{
    object_id: string;
    provider: string;
    servicelevel?: { name?: string };
    servicelevel_name?: string;
    amount: string;
    currency: string;
    estimated_days?: number;
  }>;
  messages?: unknown[];
};

type ShippoTransaction = {
  was_test?: boolean;
  status?: string;
  tracking_number?: string;
  label_url?: string;
  object_id?: string;
  messages?: unknown[];
};

export async function getTestRates(args: {
  token: string;
  from: ShippoAddress;
  to: ShippoAddress;
  parcel: ShippoParcel;
  fetchImpl?: typeof fetch;
}): Promise<{ mode: "test"; shipment_id: string; rates: RateQuote[] }> {
  assertTestShippoToken(args.token);
  if (!validateAddress(args.from) || !validateAddress(args.to) || !validateParcel(args.parcel)) {
    throw Object.assign(new Error("Invalid address or parcel"), { status: 422 });
  }
  const result = await shippoPost<ShippoShipment>(
    args.token,
    "/shipments/",
    {
      address_from: args.from,
      address_to: args.to,
      parcels: [args.parcel],
      async: false,
    },
    args.fetchImpl,
  );
  const rates = (result.rates || [])
    .filter((r) => r && r.object_id && ["USPS", "UPS"].includes(r.provider))
    .map((r) => ({
      id: r.object_id,
      provider: r.provider,
      service: r.servicelevel?.name || r.servicelevel_name || "",
      amount: r.amount,
      currency: r.currency,
      days: r.estimated_days,
    }))
    .sort((a, b) => Number(a.amount) - Number(b.amount));
  return { mode: "test", shipment_id: result.object_id, rates };
}

export async function createTestLabel(args: {
  token: string;
  rateId: string;
  fetchImpl?: typeof fetch;
}): Promise<{
  mode: "test";
  was_test: true;
  status?: string;
  tracking_number: string | null;
  label_url: string | null;
  transaction_id?: string;
}> {
  assertTestShippoToken(args.token);
  if (!args.rateId || args.rateId.length > 100) {
    throw Object.assign(new Error("Select an existing test rate first"), { status: 422 });
  }
  const result = await shippoPost<ShippoTransaction>(
    args.token,
    "/transactions/",
    { rate: args.rateId, label_file_type: "PDF_4x6", async: false },
    args.fetchImpl,
  );
  assertWasTest(result);
  return {
    mode: "test",
    was_test: true,
    status: result.status,
    tracking_number: result.tracking_number || null,
    label_url: result.label_url || null,
    transaction_id: result.object_id,
  };
}
