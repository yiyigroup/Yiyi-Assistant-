import { requireApiAccess, noStoreJson } from "@/lib/auth/guard";
import { getSheetsAdapter } from "@/lib/sheets/client";
import { loadOrdersFromSheets, orderFingerprint } from "@/lib/sheets/rows";
import { groupCustomers } from "@/lib/orders/group";

export async function GET(request: Request) {
  const access = await requireApiAccess(request, false);
  if (!access.ok) return access.response;

  try {
    const adapter = getSheetsAdapter();
    const { orders, syncedAt } = await loadOrdersFromSheets(adapter);
    const groups = groupCustomers(orders);
    const ordersWithFp = orders.map((o) => ({
      ...o,
      fingerprint: orderFingerprint(o),
    }));
    return noStoreJson({
      orders: ordersWithFp,
      groups,
      syncedAt,
      stale: false,
      source: "google-sheets",
    });
  } catch (e) {
    return noStoreJson(
      {
        error: e instanceof Error ? e.message : "Failed to load orders",
        stale: true,
        orders: null,
      },
      502,
    );
  }
}
