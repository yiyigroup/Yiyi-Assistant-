import { createHash } from "node:crypto";

export function sha256Hex(data: ArrayBuffer | Buffer | string): string {
  const buf =
    typeof data === "string" ? Buffer.from(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
  return createHash("sha256").update(buf).digest("hex");
}

export function rowSignature(parts: {
  name: string;
  route: string;
  content: string;
  amountRaw: string;
}): string {
  const name = parts.name
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s\u3000]+/g, "");
  const content = parts.content.toLowerCase().replace(/[\s\u3000]+/g, "");
  return [name, parts.route, content, parts.amountRaw].join("|");
}
