import { HEADER_ALIASES, cellByAlias } from "@/lib/sheets/headers";
import { routeForSheet } from "@/lib/orders/classify";
import { normalizeName, normalizePhone } from "@/lib/orders/group";
import type { OrderItem, OrderRow } from "@/lib/orders/types";
import { FEE_TAB } from "@/lib/config/sheet";

export type SheetData = { name: string; rows: unknown[][] };

const str = (v: unknown) => String(v ?? "").trim();

export function parseQuantity(text: string): number | null {
  const matches = [
    ...String(text).matchAll(
      /(?:[xX×＊*]\s*|数量\s*[:：]?\s*)(\d{1,3})(?=\s|$|[，,；;。到缺自寄发）\]])/g,
    ),
  ];
  if (matches.length === 1) return Number(matches[0]![1]);
  const m = String(text).match(
    /(?:^|[（(,，\s])(\d{1,3})\s*(?:件|个|双|条|盒|套)(?:$|[，,；;。)）\s])/,
  );
  return m ? Number(m[1]) : null;
}

export function splitItems(content: string): OrderItem[] {
  const s = String(content || "")
    .replace(/\r/g, "")
    .trim();
  if (!s) return [];
  let lines = s.split(/\n+/).map(str).filter(Boolean);
  if (lines.length === 1 && /[，,；;]/.test(lines[0]!)) {
    lines = lines[0]!
      .split(/[，,；;]+/)
      .map(str)
      .filter(Boolean);
  }
  return lines.map((raw, i) => ({
    id: String(i),
    raw,
    qty: parseQuantity(raw),
    status: /缺货|未到货|没到货|无货/.test(raw) ? "missing" : /到货/.test(raw) ? "arrived" : null,
  }));
}

export function parseCsv(text: string): SheetData[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (c === '"') quoted = false;
      else value += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(value);
      value = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some(str)) rows.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  row.push(value);
  if (row.some(str)) rows.push(row);
  return [{ name: "导入文件", rows }];
}

export function mapWorkbook(
  sheets: SheetData[],
  fileHash: string,
): { orders: OrderRow[]; ignored: string[] } {
  const result: OrderRow[] = [];
  const ignored: string[] = [];
  for (const sheet of sheets) {
    if (new RegExp(FEE_TAB, "i").test(sheet.name)) {
      ignored.push(sheet.name);
      continue;
    }
    const rows = sheet.rows || [];
    const headIdx = rows.findIndex((r) => r && r.some(str));
    if (headIdx < 0) continue;
    const headers = rows[headIdx]!;
    for (let ix = headIdx + 1; ix < rows.length; ix++) {
      const r = rows[ix];
      if (!r || !r.some(str)) continue;
      const name = cellByAlias(r, headers, HEADER_ALIASES.name, 3);
      const content = cellByAlias(r, headers, HEADER_ALIASES.content, 4);
      if (!name && !content) continue;
      const rawAmount = cellByAlias(r, headers, HEADER_ALIASES.amount, 5);
      const amountNum = Number(String(rawAmount).replace(/[$,]/g, ""));
      const arrival = cellByAlias(r, headers, HEADER_ALIASES.arrival, 0);
      const payment = cellByAlias(r, headers, HEADER_ALIASES.payment, 1);
      const orderNumber = cellByAlias(r, headers, HEADER_ALIASES.orderNumber, 2);
      const tail = r.slice(6).map(str).filter(Boolean);
      const phoneCell =
        tail.find((x) => /(?:\+?1[\s().-]*)?\(?\d{3}\)?[\s().-]*\d{3}[\s().-]*\d{4}/.test(x)) || "";
      const phoneMatch = phoneCell.match(
        /(?:\+?1[\s().-]*)?\(?\d{3}\)?[\s().-]*\d{3}[\s().-]*\d{4}/,
      );
      const phone = phoneMatch ? phoneMatch[0] : "";
      const zip = (tail.join(" ").match(/\b\d{5}(?:-\d{4})?\b/) || [])[0] || "";
      const address =
        tail.find((x) =>
          /\d+\s+[^,]+(?:street|st\.?|road|rd\.?|avenue|ave\.?|drive|dr\.?|court|ct\.?|lane|ln\.?|boulevard|blvd\.?|way|terrace|pl\.?)/i.test(
            x,
          ),
        ) || "";
      const items = splitItems(content);
      const fullArrival = /到齐|全部到|全到/.test(arrival);
      for (const item of items) {
        if (!item.status) item.status = fullArrival ? "arrived" : "waiting";
      }
      const route = routeForSheet(sheet.name, r);
      const sourceRow = ix + 1;
      const order: OrderRow = {
        id: `${fileHash}|${sheet.name}|${sourceRow}`,
        sourceSheet: sheet.name,
        sourceRow,
        route,
        name,
        phone,
        phoneKey: normalizePhone(phone),
        zip,
        address,
        orderNumber,
        content,
        amount: rawAmount && Number.isFinite(amountNum) ? amountNum : null,
        amountRaw: rawAmount,
        arrivalOriginal: arrival,
        paymentOriginal: payment,
        items,
        issues: [],
        originalRow: [...r],
      };
      if (!name) order.issues.push("缺少客户姓名");
      if (!content) order.issues.push("商品内容为空");
      if (rawAmount && !Number.isFinite(amountNum)) order.issues.push("订单金额无法识别");
      if (!rawAmount) order.issues.push("缺少订单金额");
      if (items.some((x) => x.qty === null)) order.issues.push("有商品数量无法自动识别");
      if (/差|缺|未到/.test(arrival) || items.some((x) => x.status === "missing")) {
        order.issues.push("原表显示部分到货或缺货");
      }
      if (!phone) order.issues.push("未识别到电话号码，客户匹配需复核");
      result.push(order);
    }
  }

  const byName = new Map<string, OrderRow[]>();
  for (const o of result) {
    const k = normalizeName(o.name) || o.id;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k)!.push(o);
  }
  for (const list of byName.values()) {
    const phones = [...new Set(list.map((o) => o.phoneKey).filter(Boolean))];
    if (phones.length > 1) {
      for (const o of list) {
        o.issues.push("同名订单存在多个电话号码，请确认是否同一客户");
      }
    }
  }
  return { orders: result, ignored };
}
