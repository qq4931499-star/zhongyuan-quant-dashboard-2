import { describe, expect, it } from "vitest";
import { parseAStockIdentitySearch } from "./stockIdentity";

const payload = 'v_hint="sh~600376~\\u9996\\u5f00\\u80a1\\u4efd~skgf~GP-A^sz~000001~\\u5e73\\u5b89\\u94f6\\u884c~payh~GP-A^sh~000001~\\u4e0a\\u8bc1\\u6307\\u6570~szzs~ZS"';

describe("parseAStockIdentitySearch", () => {
  it("使用六位代码精确匹配 A 股并补全名称", () => {
    expect(parseAStockIdentitySearch(payload, "600376")).toEqual({ symbol: "600376", stockName: "首开股份" });
  });

  it("使用中文全称精确匹配 A 股并补全代码", () => {
    expect(parseAStockIdentitySearch(payload, "平安银行")).toEqual({ symbol: "000001", stockName: "平安银行" });
  });

  it("对部分名称、非 A 股候选与无结果不自动匹配", () => {
    expect(parseAStockIdentitySearch(payload, "首开")).toBeNull();
    expect(parseAStockIdentitySearch(payload, "上证指数")).toBeNull();
    expect(parseAStockIdentitySearch('v_hint="N"', "600376")).toBeNull();
  });
});
