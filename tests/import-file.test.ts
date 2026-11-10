import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { parseImportFile, looksLikeZip } from "@/lib/import/file";
import { readOrderWorkbook } from "@/lib/import/xlsx";

/** Build a minimal stored (method 0) or deflated ZIP with one or more entries. */
function buildZip(entries: { name: string; content: string; deflate?: boolean }[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const raw = Buffer.from(e.content, "utf8");
    const body = e.deflate ? deflateRawSync(raw) : raw;
    const method = e.deflate ? 8 : 0;
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(0, 14); // crc
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    parts.push(local, body);

    const cen = Buffer.alloc(46 + nameBuf.length);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(0, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    nameBuf.copy(cen, 46);
    central.push(cen);
    offset += local.length + body.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralBuf, end]);
}

const CONTENT_TYPES = `<?xml version="1.0"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK = `<?xml version="1.0"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="邮寄" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

const WORKBOOK_RELS = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

const SHARED = `<?xml version="1.0"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="6" uniqueCount="6">
  <si><t>到货情况</t></si><si><t>付款情况</t></si><si><t>序号</t></si>
  <si><t>姓名</t></si><si><t>内容</t></si><si><t>总价</t></si>
  <si><t>N1</t></si><si><t>Wei</t></si><si><t>奶粉x1 送货费</t></si><si><t>55</t></si>
</sst>`;

const SHEET1 = `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c>
      <c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c><c r="F1" t="s"><v>5</v></c>
    </row>
    <row r="2">
      <c r="A2"/><c r="B2"/><c r="C2" t="s"><v>6</v></c>
      <c r="D2" t="s"><v>7</v></c><c r="E2" t="s"><v>8</v></c><c r="F2" t="s"><v>9</v></c>
    </row>
  </sheetData>
</worksheet>`;

describe("import file parsing", () => {
  it("parses CSV uploads", () => {
    const csv = Buffer.from(
      "到货情况,付款情况,序号,姓名,内容,总价\n,,C1,Amy,饼干x2 自提,16\n",
      "utf8",
    );
    const parsed = parseImportFile({ filename: "接龙.csv", buffer: csv });
    expect(parsed.format).toBe("csv");
    expect(parsed.sheets[0]?.rows.length).toBeGreaterThanOrEqual(2);
  });

  it("reads a minimal XLSX workbook", () => {
    const buf = buildZip([
      { name: "[Content_Types].xml", content: CONTENT_TYPES },
      { name: "_rels/.rels", content: ROOT_RELS },
      { name: "xl/workbook.xml", content: WORKBOOK },
      { name: "xl/_rels/workbook.xml.rels", content: WORKBOOK_RELS },
      { name: "xl/sharedStrings.xml", content: SHARED },
      { name: "xl/worksheets/sheet1.xml", content: SHEET1, deflate: true },
    ]);
    expect(looksLikeZip(buf)).toBe(true);
    const sheets = readOrderWorkbook(buf);
    expect(sheets[0]?.name).toBe("邮寄");
    const header = sheets[0]?.rows[0];
    expect(header?.[3]).toBe("姓名");
    expect(sheets[0]?.rows[1]?.[3]).toBe("Wei");

    const parsed = parseImportFile({ filename: "orders.xlsx", buffer: buf });
    expect(parsed.format).toBe("xlsx");
    expect(parsed.sheets[0]?.name).toBe("邮寄");
  });

  it("rejects unsupported extensions", () => {
    expect(() =>
      parseImportFile({ filename: "notes.txt", buffer: Buffer.from("hello") }),
    ).toThrow(/xlsx|csv/i);
  });
});
