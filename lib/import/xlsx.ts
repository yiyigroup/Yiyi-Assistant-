import { inflateRawSync } from "node:zlib";
import type { SheetData } from "./parse";

type ZipEntry = { method: number; compressed: number; local: number };

function u16(view: DataView, p: number): number {
  return view.getUint16(p, true);
}

function u32(view: DataView, p: number): number {
  return view.getUint32(p, true);
}

/** Minimal attribute + text extractors for OOXML (no DOM required). */
function attrs(openTag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(openTag))) out[m[1]!] = m[2]!;
  return out;
}

function findTags(xml: string, name: string): { open: string; inner: string }[] {
  const out: { open: string; inner: string }[] = [];
  const re = new RegExp(`<(?:[\\w-]+:)?${name}\\b([^>]*)>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${name}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push({ open: m[1] ?? "", inner: m[2] ?? "" });
  // self-closing
  const self = new RegExp(`<(?:[\\w-]+:)?${name}\\b([^>]*)\\/>`, "g");
  while ((m = self.exec(xml))) out.push({ open: m[1] ?? "", inner: "" });
  return out;
}

function textContent(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function decodeZip(buffer: Buffer): Map<string, ZipEntry> {
  const data = buffer;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let p = data.length - 22; p >= Math.max(0, data.length - 65558); p--) {
    if (u32(view, p) === 0x06054b50) {
      end = p;
      break;
    }
  }
  if (end < 0) throw new Error("这不是有效的 .xlsx 文件");
  const files = new Map<string, ZipEntry>();
  let pos = u32(view, end + 16);
  const total = u16(view, end + 10);
  for (let i = 0; i < total; i++) {
    if (u32(view, pos) !== 0x02014b50) throw new Error("Excel 压缩包目录无效");
    const method = u16(view, pos + 10);
    const compressed = u32(view, pos + 20);
    const nameLen = u16(view, pos + 28);
    const extra = u16(view, pos + 30);
    const comment = u16(view, pos + 32);
    const local = u32(view, pos + 42);
    const name = data.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");
    files.set(name, { method, compressed, local });
    pos += 46 + nameLen + extra + comment;
  }
  return files;
}

function readEntry(data: Buffer, view: DataView, files: Map<string, ZipEntry>, path: string): string {
  const f = files.get(path);
  if (!f) throw new Error(`Excel 文件缺少组件：${path}`);
  const start = f.local + 30 + u16(view, f.local + 26) + u16(view, f.local + 28);
  const bytes = data.subarray(start, start + f.compressed);
  if (f.method === 0) return Buffer.from(bytes).toString("utf8");
  if (f.method !== 8) throw new Error("暂不支持此 Excel 压缩格式");
  return inflateRawSync(bytes).toString("utf8");
}

function colIndexFromRef(ref: string): number {
  const letters = (ref.match(/^[A-Z]+/) || [])[0];
  if (!letters) return -1;
  let col = 0;
  for (const letter of letters) col = col * 26 + letter.charCodeAt(0) - 64;
  return col - 1;
}

function readSheetRows(
  sheetXml: string,
  sharedStrings: string[],
): unknown[][] {
  const rows: unknown[][] = [];
  for (const row of findTags(sheetXml, "row")) {
    const rowNum = Number(attrs(row.open).r);
    if (!rowNum || rowNum > 100000) continue;
    const cells: unknown[] = [];
    // match cell opens including nested (inlineStr)
    const cellRe = /<(?:[\w-]+:)?c\b([^>]*)(?:\/>|>([\s\S]*?)<\/(?:[\w-]+:)?c>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(row.inner))) {
      const a = attrs(cm[1] ?? "");
      const inner = cm[2] ?? "";
      const col = colIndexFromRef(a.r || "");
      if (col < 0 || col > 60) continue;
      const type = a.t;
      const vMatch = inner.match(/<(?:[\w-]+:)?v\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?v>/);
      let value: unknown = vMatch ? textContent(vMatch[1]!) : "";
      if (type === "s") value = sharedStrings[Number(value)] ?? "";
      else if (type === "inlineStr") {
        const parts = findTags(inner, "t").map((t) => textContent(t.inner));
        value = parts.join("");
      } else if (type === "b") value = value === "1" || value === 1;
      else if (type !== "str" && type !== "e" && value !== "" && !Number.isNaN(Number(value))) {
        value = Number(value);
      }
      cells[col] = value;
    }
    rows[rowNum - 1] = cells;
  }
  return rows;
}

/**
 * Read-only XLSX workbook → sheet name + cell matrix.
 * Port of legacy/dist/workbook-reader.js for Node (zlib, no DOMParser).
 */
export function readOrderWorkbook(buffer: Buffer): SheetData[] {
  const data = buffer;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const files = decodeZip(data);
  const workbook = readEntry(data, view, files, "xl/workbook.xml");
  const rels = readEntry(data, view, files, "xl/_rels/workbook.xml.rels");

  let strings: string[] = [];
  if (files.has("xl/sharedStrings.xml")) {
    const s = readEntry(data, view, files, "xl/sharedStrings.xml");
    strings = findTags(s, "si").map((si) =>
      findTags(si.inner, "t")
        .map((t) => textContent(t.inner))
        .join(""),
    );
  }

  const relById = new Map<string, string>();
  for (const rel of findTags(rels, "Relationship")) {
    const a = attrs(rel.open);
    if (a.Id && a.Target) relById.set(a.Id, a.Target);
  }

  const sheetsMeta: { name: string; path: string }[] = [];
  for (const sheet of findTags(workbook, "sheet")) {
    const a = attrs(sheet.open);
    const id = a["r:id"] || a["RelationshipId"] || a.id;
    if (!id) continue;
    const target = (relById.get(id) || "").replace(/^\/+/, "").replace(/^\.\//, "");
    if (!target) continue;
    const path = target.startsWith("xl/") ? target : `xl/${target}`;
    sheetsMeta.push({ name: a.name || "", path });
  }

  return sheetsMeta.map((s) => {
    const xml = readEntry(data, view, files, s.path);
    return { name: s.name, rows: readSheetRows(xml, strings) };
  });
}
