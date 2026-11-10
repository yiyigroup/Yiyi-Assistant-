const str = (v: unknown) => String(v ?? "").trim();

export function normalizeHeader(h: unknown): string {
  return str(h)
    .toLowerCase()
    .replace(/[\s_\-]/g, "");
}

export function colIndex(headers: unknown[], aliases: string[]): number {
  const normalizedAliases = aliases.map(normalizeHeader);
  for (let i = 0; i < headers.length; i++) {
    const h = normalizeHeader(headers[i]);
    if (normalizedAliases.includes(h)) return i;
  }
  return -1;
}

export function headerIssues(headers: unknown[]): string[] {
  const issues: string[] = [];
  const seen = new Map<string, number>();
  for (const h of headers) {
    const n = normalizeHeader(h);
    if (!n) continue;
    seen.set(n, (seen.get(n) ?? 0) + 1);
  }
  for (const [h, count] of seen) {
    if (count > 1) issues.push(`duplicate header: ${h}`);
  }
  if (headers.every((h) => !str(h))) issues.push("missing headers");
  return issues;
}

export const HEADER_ALIASES = {
  name: ["姓名", "客户姓名", "客户", "微信名", "customer", "customer_name"],
  content: ["内容", "商品内容", "商品明细", "商品", "items", "description"],
  amount: ["总价", "金额", "订单金额", "total", "amount"],
  arrival: ["到货情况", "到货状态", "arrival", "arrival_status"],
  payment: ["付款情况", "付款状态", "payment", "payment_status"],
  orderNumber: ["序号", "订单号", "订单编号", "order_id", "order_number"],
} as const;

export function cellByAlias(
  row: unknown[],
  headers: unknown[],
  aliases: readonly string[],
  fallback = -1,
): string {
  const i = colIndex(headers, [...aliases]);
  const idx = i >= 0 ? i : fallback;
  if (idx < 0 || idx >= row.length) return "";
  return str(row[idx]);
}
