import { getSheetId, isAllowedTab, type AllowedTab } from "@/lib/config/sheet";
import { parseCellA1 } from "@/lib/sheets/a1";

export type CellUpdate = { a1: string; value: string };

export type SheetsAdapter = {
  readRange: (tab: AllowedTab, rangeA1: string) => Promise<unknown[][]>;
  appendRows: (tab: AllowedTab, rows: unknown[][]) => Promise<void>;
  /** Update discrete cells with RAW values (non-updated cells stay untouched). */
  updateCells: (tab: AllowedTab, updates: CellUpdate[]) => Promise<void>;
  deleteRowsDescending: (
    tab: AllowedTab,
    rowNumbers1Based: number[],
  ) => Promise<{ ok: boolean; failed: number[] }>;
  listTabs: () => Promise<string[]>;
  createTab: (title: string, headers: string[]) => Promise<void>;
};

/** In-memory mock for CI / local without credentials. */
export function createMockSheets(seed?: Record<string, unknown[][]>): SheetsAdapter {
  const tabs = new Map<string, unknown[][]>(
    Object.entries(
      seed ?? {
        自提: [["到货情况", "付款情况", "序号", "姓名", "内容", "总价"]],
        邮寄: [["到货情况", "付款情况", "序号", "姓名", "内容", "总价"]],
        三谷: [["到货情况", "付款情况", "序号", "姓名", "内容", "总价"]],
        "95008": [["到货情况", "付款情况", "序号", "姓名", "内容", "总价"]],
        shippo: [["carrier", "fee"]],
      },
    ),
  );

  return {
    async listTabs() {
      return [...tabs.keys()];
    },
    async readRange(tab, _rangeA1) {
      if (!isAllowedTab(tab)) throw new Error("tab not allowed");
      return tabs.get(tab) ?? [];
    },
    async appendRows(tab, rows) {
      if (!isAllowedTab(tab)) throw new Error("tab not allowed");
      const cur = tabs.get(tab) ?? [];
      tabs.set(tab, [...cur, ...rows]);
    },
    async updateCells(tab, updates) {
      if (!isAllowedTab(tab)) throw new Error("tab not allowed");
      const cur = [...(tabs.get(tab) ?? [])].map((r) => [...r]);
      for (const u of updates) {
        const { col0, row1 } = parseCellA1(u.a1);
        const idx = row1 - 1;
        while (cur.length <= idx) cur.push([]);
        const row = [...(cur[idx] ?? [])];
        while (row.length <= col0) row.push("");
        row[col0] = u.value;
        cur[idx] = row;
      }
      tabs.set(tab, cur);
    },
    async deleteRowsDescending(tab, rowNumbers1Based) {
      if (!isAllowedTab(tab)) throw new Error("tab not allowed");
      const cur = [...(tabs.get(tab) ?? [])];
      const failed: number[] = [];
      for (const n of [...rowNumbers1Based].sort((a, b) => b - a)) {
        if (n < 1 || n > cur.length) failed.push(n);
        else cur.splice(n - 1, 1);
      }
      tabs.set(tab, cur);
      return { ok: failed.length === 0, failed };
    },
    async createTab(title, headers) {
      if (tabs.has(title)) return;
      tabs.set(title, [headers]);
    },
  };
}

let cached: SheetsAdapter | null = null;

export function getSheetsAdapter(): SheetsAdapter {
  if (cached) return cached;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) {
    cached = createMockSheets();
    return cached;
  }
  // Live client loads lazily — sheet ID owned server-side only.
  cached = createLiveSheetsAdapter();
  return cached;
}

function createLiveSheetsAdapter(): SheetsAdapter {
  // Dynamic import path kept sync-friendly via lazy promise cache inside methods.
  let clientPromise: Promise<import("googleapis").sheets_v4.Sheets> | null = null;
  async function client() {
    if (!clientPromise) {
      clientPromise = (async () => {
        const { google } = await import("googleapis");
        const auth = new google.auth.JWT({
          email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        return google.sheets({ version: "v4", auth });
      })();
    }
    return clientPromise;
  }

  return {
    async listTabs() {
      const sheets = await client();
      const res = await sheets.spreadsheets.get({ spreadsheetId: getSheetId() });
      return (res.data.sheets ?? [])
        .map((s) => s.properties?.title)
        .filter((t): t is string => Boolean(t));
    },
    async readRange(tab, rangeA1) {
      if (!isAllowedTab(tab)) throw new Error("tab not allowed");
      const sheets = await client();
      // Bounded range — callers must pass explicit A1, never client spreadsheet IDs.
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: getSheetId(),
        range: `'${tab}'!${rangeA1}`,
      });
      return (res.data.values as unknown[][]) ?? [];
    },
    async appendRows(tab, rows) {
      if (!isAllowedTab(tab)) throw new Error("tab not allowed");
      const sheets = await client();
      await sheets.spreadsheets.values.append({
        spreadsheetId: getSheetId(),
        range: `'${tab}'!A1`,
        valueInputOption: "RAW",
        requestBody: { values: rows as string[][] },
      });
    },
    async updateCells(tab, updates) {
      if (!isAllowedTab(tab)) throw new Error("tab not allowed");
      if (!updates.length) return;
      const sheets = await client();
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: getSheetId(),
        requestBody: {
          valueInputOption: "RAW",
          data: updates.map((u) => ({
            range: `'${tab}'!${u.a1}`,
            values: [[u.value]],
          })),
        },
      });
    },
    async deleteRowsDescending(tab, rowNumbers1Based) {
      if (!isAllowedTab(tab)) throw new Error("tab not allowed");
      const sheets = await client();
      const meta = await sheets.spreadsheets.get({ spreadsheetId: getSheetId() });
      const sheet = meta.data.sheets?.find((s) => s.properties?.title === tab);
      const sheetId = sheet?.properties?.sheetId;
      if (sheetId === undefined || sheetId === null) {
        return { ok: false, failed: rowNumbers1Based };
      }
      const failed: number[] = [];
      for (const n of [...rowNumbers1Based].sort((a, b) => b - a)) {
        try {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: getSheetId(),
            requestBody: {
              requests: [
                {
                  deleteDimension: {
                    range: {
                      sheetId,
                      dimension: "ROWS",
                      startIndex: n - 1,
                      endIndex: n,
                    },
                  },
                },
              ],
            },
          });
        } catch {
          failed.push(n);
        }
      }
      return { ok: failed.length === 0, failed };
    },
    async createTab(title, headers) {
      const sheets = await client();
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: getSheetId(),
        requestBody: {
          requests: [{ addSheet: { properties: { title } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: getSheetId(),
        range: `'${title}'!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      });
    },
  };
}

export function resetSheetsAdapterCache(): void {
  cached = null;
}
