import { isOrderTab, type OrderTab } from "@/lib/config/sheet";
import { classifyFulfillment } from "@/lib/orders/classify";
import type { Fulfillment, OrderRow } from "@/lib/orders/types";
import { proposeRegion } from "@/lib/region/zip";

export type TabProposal = {
  tab: OrderTab | null;
  fulfillment: Fulfillment;
  regionNote: string | null;
  reason: string;
};

/**
 * Destination tab for append-only import.
 * Exact regional ZIP seed wins over fulfillment; nearby/conflict needs review.
 */
export function proposeImportTab(order: OrderRow): TabProposal {
  const fulfillment = classifyFulfillment([order]);
  const region = order.zip ? proposeRegion(order.zip) : { status: "none" as const };

  if (region.status === "exact") {
    return {
      tab: region.region,
      fulfillment,
      regionNote: null,
      reason: `精确邮编 ${region.zip} → ${region.region}`,
    };
  }
  if (region.status === "nearby") {
    return {
      tab: null,
      fulfillment,
      regionNote: region.note,
      reason: `${region.note}（${region.region}）`,
    };
  }
  if (region.status === "conflict") {
    return {
      tab: null,
      fulfillment,
      regionNote: region.note,
      reason: region.note,
    };
  }

  if (fulfillment === "自提") {
    return { tab: "自提", fulfillment, regionNote: null, reason: "内容含自提/自取" };
  }
  if (fulfillment === "邮寄") {
    return { tab: "邮寄", fulfillment, regionNote: null, reason: "内容含送货费" };
  }
  if (fulfillment === "待确认") {
    return {
      tab: null,
      fulfillment,
      regionNote: null,
      reason: "自提与送货费冲突，需人工确认",
    };
  }

  if (isOrderTab(order.sourceSheet)) {
    return {
      tab: order.sourceSheet,
      fulfillment,
      regionNote: null,
      reason: `来源工作表 ${order.sourceSheet}`,
    };
  }

  return {
    tab: null,
    fulfillment,
    regionNote: null,
    reason: "履约与区域均未确定 → 待分类",
  };
}
