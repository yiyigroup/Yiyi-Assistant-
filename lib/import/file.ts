import { parseCsv, type SheetData } from "./parse";
import { readOrderWorkbook } from "./xlsx";

export type ParsedImportFile = {
  sheets: SheetData[];
  format: "csv" | "xlsx";
};

export function looksLikeZip(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}

/**
 * Parse an uploaded 接龙 file. Supports .csv and .xlsx by extension or ZIP magic.
 */
export function parseImportFile(args: {
  filename: string;
  buffer: Buffer;
}): ParsedImportFile {
  const name = args.filename;
  const isCsv = /\.csv$/i.test(name);
  const isXlsx = /\.xlsx$/i.test(name) || (!isCsv && looksLikeZip(args.buffer));

  if (isXlsx) {
    try {
      const sheets = readOrderWorkbook(args.buffer);
      if (!sheets.length) throw new Error("工作簿中没有工作表");
      return { sheets, format: "xlsx" };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : "无法解析 XLSX");
    }
  }

  if (isCsv || args.buffer.toString("utf8").includes(",")) {
    return { sheets: parseCsv(args.buffer.toString("utf8")), format: "csv" };
  }

  throw new Error("请上传 .xlsx 或 .csv 文件");
}
