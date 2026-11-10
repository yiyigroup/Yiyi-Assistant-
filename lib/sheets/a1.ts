/** Convert 0-based column index to A1 column letters (0 → A, 25 → Z, 26 → AA). */
export function colToA1(col0: number): string {
  if (!Number.isInteger(col0) || col0 < 0) {
    throw new Error("Invalid column index");
  }
  let n = col0 + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** A1 cell reference from 0-based column and 1-based row. */
export function cellA1(col0: number, row1: number): string {
  if (!Number.isInteger(row1) || row1 < 1) {
    throw new Error("Invalid row number");
  }
  return `${colToA1(col0)}${row1}`;
}

/** Parse simple A1 like "B12" → { col0, row1 }. No sheet name or ranges. */
export function parseCellA1(a1: string): { col0: number; row1: number } {
  const m = String(a1)
    .trim()
    .toUpperCase()
    .match(/^([A-Z]+)(\d+)$/);
  if (!m) throw new Error(`Invalid A1 cell: ${a1}`);
  const letters = m[1]!;
  let col0 = 0;
  for (let i = 0; i < letters.length; i++) {
    col0 = col0 * 26 + (letters.charCodeAt(i) - 64);
  }
  col0 -= 1;
  return { col0, row1: Number(m[2]) };
}
