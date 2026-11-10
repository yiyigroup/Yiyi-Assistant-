import { createHash } from "node:crypto";

export function rowFingerprint(parts: {
  sourceSheet: string;
  sourceRow: number;
  orderNumber: string;
  name: string;
  content: string;
  amountRaw: string;
  arrivalOriginal: string;
  paymentOriginal: string;
  originalRow: unknown[];
}): string {
  const payload = JSON.stringify({
    sourceSheet: parts.sourceSheet,
    sourceRow: parts.sourceRow,
    orderNumber: parts.orderNumber,
    name: parts.name,
    content: parts.content,
    amountRaw: parts.amountRaw,
    arrival: parts.arrivalOriginal,
    payment: parts.paymentOriginal,
    originalRow: parts.originalRow,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export function fingerprintsMatch(expected: string, actual: string): boolean {
  return expected.length > 0 && expected === actual;
}
