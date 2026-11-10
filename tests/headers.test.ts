import { describe, expect, it } from "vitest";
import { colIndex, headerIssues, normalizeHeader } from "@/lib/sheets/headers";

describe("headers", () => {
  it("maps aliases per tab via normalized names", () => {
    const headers = ["到货情况", "付款情况", "序号", "客户姓名", "商品内容", "金额"];
    expect(colIndex(headers, ["姓名", "客户姓名"])).toBe(3);
    expect(colIndex(headers, ["内容", "商品内容"])).toBe(4);
    expect(normalizeHeader("客户_姓名")).toBe("客户姓名");
  });

  it("flags missing and duplicate headers", () => {
    expect(headerIssues(["", "", ""])).toContain("missing headers");
    expect(headerIssues(["姓名", "姓名", "内容"]).some((i) => i.includes("duplicate"))).toBe(true);
  });
});
