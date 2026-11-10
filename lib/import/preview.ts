import { rowSignature } from "@/lib/idempotency/hash";
import type { Fulfillment, OrderRow } from "@/lib/orders/types";
import type { OrderTab } from "@/lib/config/sheet";
import { mapWorkbook, parseCsv, type SheetData } from "./parse";
import { proposeImportTab } from "./route-tab";

export type ImportDisposition = "insert" | "skipped_duplicate" | "needs_review";

export type ImportPreviewRow = {
  order: OrderRow;
  disposition: ImportDisposition;
  proposedTab: OrderTab | null;
  fulfillment: Fulfillment;
  tabReason: string;
  regionNote: string | null;
};

export type ImportParseError = {
  sheet: string;
  message: string;
};

export type ImportPreview = {
  fileHash: string;
  ignoredSheets: string[];
  parseErrors: ImportParseError[];
  rows: ImportPreviewRow[];
  insertCount: number;
  duplicateCount: number;
  reviewCount: number;
  /** Rows that would append on confirm (insert + needs_review with a tab). */
  appendCount: number;
};

function normalizeOrderNumber(raw: string): string {
  return String(raw || "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s\u3000]+/g, "");
}

/** Content signature without route — survives tab reassignment after append. */
export function importContentSignature(parts: {
  name: string;
  content: string;
  amountRaw: string;
}): string {
  return rowSignature({
    name: parts.name,
    route: "",
    content: parts.content,
    amountRaw: parts.amountRaw,
  });
}

export function previewImport(args: {
  fileHash: string;
  sheets: SheetData[];
  existing: OrderRow[];
  alreadyImportedHashes: Set<string>;
}): ImportPreview {
  if (args.alreadyImportedHashes.has(args.fileHash)) {
    return {
      fileHash: args.fileHash,
      ignoredSheets: [],
      parseErrors: [
        {
          sheet: "",
          message: "此文件 SHA-256 已成功导入过（幂等），不会再次写入",
        },
      ],
      rows: [],
      insertCount: 0,
      duplicateCount: 0,
      reviewCount: 0,
      appendCount: 0,
    };
  }

  const parseErrors: ImportParseError[] = [];
  let parsed: { orders: OrderRow[]; ignored: string[] };
  try {
    parsed = mapWorkbook(args.sheets, args.fileHash);
  } catch (e) {
    return {
      fileHash: args.fileHash,
      ignoredSheets: [],
      parseErrors: [
        {
          sheet: "",
          message: e instanceof Error ? e.message : "解析失败",
        },
      ],
      rows: [],
      insertCount: 0,
      duplicateCount: 0,
      reviewCount: 0,
      appendCount: 0,
    };
  }

  if (!args.sheets.length) {
    parseErrors.push({ sheet: "", message: "文件中没有工作表" });
  }
  for (const sheet of args.sheets) {
    if (!sheet.rows?.length) {
      parseErrors.push({ sheet: sheet.name || "(未命名)", message: "工作表为空" });
    }
  }
  if (!parsed.orders.length && !parseErrors.length) {
    parseErrors.push({
      sheet: "",
      message: "没有识别到订单行，请检查工作表和表头（姓名/内容等）",
    });
  }

  const existingOrderNumbers = new Set(
    args.existing.map((o) => normalizeOrderNumber(o.orderNumber)).filter(Boolean),
  );
  const existingContent = new Set(
    args.existing.map((o) =>
      importContentSignature({
        name: o.name,
        content: o.content,
        amountRaw: o.amountRaw,
      }),
    ),
  );
  const existingIds = new Set(args.existing.map((o) => o.id));

  const seenOrderNumbers = new Set<string>();
  const seenContent = new Set<string>();
  const rows: ImportPreviewRow[] = [];

  for (const order of parsed.orders) {
    const tabInfo = proposeImportTab(order);
    const orderNum = normalizeOrderNumber(order.orderNumber);
    const contentSig = importContentSignature({
      name: order.name,
      content: order.content,
      amountRaw: order.amountRaw,
    });

    let disposition: ImportDisposition = "insert";

    const dupByNumber =
      Boolean(orderNum) &&
      (existingOrderNumbers.has(orderNum) || seenOrderNumbers.has(orderNum));
    const dupByContent =
      existingContent.has(contentSig) ||
      seenContent.has(contentSig) ||
      existingIds.has(order.id);

    if (dupByNumber || dupByContent) {
      disposition = "skipped_duplicate";
      if (dupByNumber) {
        order.issues.push(`订单号「${order.orderNumber}」已存在或文件内重复，跳过写入`);
      } else {
        order.issues.push(
          "与另一笔订单的客户、商品和金额相同，可能重复导入，请核对原始订单号",
        );
      }
    } else if (
      order.issues.length ||
      !tabInfo.tab ||
      tabInfo.fulfillment === "待确认" ||
      tabInfo.fulfillment === "待分类" ||
      Boolean(tabInfo.regionNote)
    ) {
      disposition = "needs_review";
    }

    if (orderNum) seenOrderNumbers.add(orderNum);
    seenContent.add(contentSig);

    rows.push({
      order,
      disposition,
      proposedTab: tabInfo.tab,
      fulfillment: tabInfo.fulfillment,
      tabReason: tabInfo.reason,
      regionNote: tabInfo.regionNote,
    });
  }

  const insertCount = rows.filter((r) => r.disposition === "insert").length;
  const duplicateCount = rows.filter((r) => r.disposition === "skipped_duplicate").length;
  const reviewCount = rows.filter((r) => r.disposition === "needs_review").length;
  const appendCount = rows.filter(
    (r) =>
      (r.disposition === "insert" || r.disposition === "needs_review") && r.proposedTab,
  ).length;

  return {
    fileHash: args.fileHash,
    ignoredSheets: parsed.ignored,
    parseErrors,
    rows,
    insertCount,
    duplicateCount,
    reviewCount,
    appendCount,
  };
}

export function sheetsFromCsvText(text: string): SheetData[] {
  return parseCsv(text);
}
