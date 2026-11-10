export const ORDER_TABS = ["自提", "邮寄", "三谷", "95008"] as const;
export const FEE_TAB = "shippo" as const;
export const ARCHIVE_TAB = "完成记录" as const;
export const ALLOWED_TABS = [...ORDER_TABS, FEE_TAB, ARCHIVE_TAB] as const;

export type OrderTab = (typeof ORDER_TABS)[number];
export type AllowedTab = (typeof ALLOWED_TABS)[number];

export function getSheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID?.trim();
  if (!id) throw new Error("GOOGLE_SHEET_ID is not configured");
  return id;
}

export function isAllowedTab(name: string): name is AllowedTab {
  return (ALLOWED_TABS as readonly string[]).includes(name);
}

export function isOrderTab(name: string): name is OrderTab {
  return (ORDER_TABS as readonly string[]).includes(name);
}
