import { describe, expect, it } from "vitest";
import { dedupeImportedTrades, getTradeImportKey, normalizeTradeDateTime, validateTradeImportRows, type ImportTrade } from "./tradeImport";

const existing: ImportTrade = {
  symbol: "600519.SH", stockName: "贵州茅台", buyPrice: 1685.5, sellPrice: 1798.6, buyDate: "2026-05-06 09:35", sellDate: "2026-05-07 10:02",
};

describe("交易批量导入去重", () => {
  it("以代码、买卖价格和买卖日期识别既有与文件内重复交易", () => {
    const fresh: ImportTrade = { ...existing, symbol: "300750.SZ", stockName: "宁德时代" };
    const result = dedupeImportedTrades([existing, fresh, { ...fresh, stockName: "宁德时代（重复名称不同也跳过）" }], [existing]);

    expect(result.accepted).toEqual([fresh]);
    expect(result.duplicateIndexes).toEqual([0, 2]);
  });

  it("标准化股票代码后生成稳定的重复识别键", () => {
    expect(getTradeImportKey({ ...existing, symbol: " 600519.sh " })).toBe(getTradeImportKey(existing));
  });

  it("按原始导入顺序返回空值、非法价格与非法交易时间的行号及错误汇总", () => {
    const result = validateTradeImportRows([
      existing,
      { ...existing, symbol: "", buyPrice: 0, buyDate: "2026/05/06 09:35" },
      { ...existing, sellPrice: -10, sellDate: "2026-13-40 10:02" },
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.issues.map(issue => issue.row)).toEqual([2, 3]);
    expect(result.issues[0]?.messages.join(" ")).toContain("股票代码不能为空");
    expect(result.issues[0]?.messages.join(" ")).toContain("买入价必须大于 0");
    expect(result.issues[1]?.messages.join(" ")).toContain("卖出价必须大于 0");
    expect(result.issues[1]?.messages.join(" ")).toContain("交易时间应为有效的 YYYY-MM-DD HH:mm");
  });

  it("允许卖出价格和卖出日期同时留空，并为未平仓记录生成稳定去重键", () => {
    const openTrade: ImportTrade = { ...existing, symbol: "300750.SZ", stockName: "宁德时代", sellPrice: null, sellDate: null };
    const validation = validateTradeImportRows([openTrade]);

    expect(validation.issues).toHaveLength(0);
    expect(validation.rows[0]).toMatchObject({ sellPrice: null, sellDate: null });
    expect(dedupeImportedTrades([openTrade, { ...openTrade, stockName: "名称改变不影响去重" }], [openTrade]).duplicateIndexes).toEqual([0, 1]);
  });

  it("兼容仅含日期的历史数据，并统一补齐 00:00", () => {
    const historical = { ...existing, buyDate: "2026-05-06", sellDate: "2026-05-07" };
    const validation = validateTradeImportRows([historical]);
    expect(normalizeTradeDateTime("2026-05-06")).toBe("2026-05-06 00:00");
    expect(validation.rows[0]).toMatchObject({ buyDate: "2026-05-06 00:00", sellDate: "2026-05-07 00:00" });
  });
});
