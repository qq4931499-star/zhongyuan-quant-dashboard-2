import { describe, expect, it } from "vitest";
import { calculateDashboardMetrics, calculateTrend, formatPercent, getTradeReturn, hasSellPrice, isRealizedTrade, type QuantTrade } from "./quant";

const sampleTrades: QuantTrade[] = [
  { id: 3, symbol: "BUY.GAIN", stockName: "上涨样例", buyPrice: 100, sellPrice: 110, buyDate: "2026-05-08 09:32", sellDate: "2026-05-09 10:05" },
  { id: 2, symbol: "SELL.LOSS", stockName: "下跌样例", buyPrice: 200, sellPrice: 180, buyDate: "2026-05-07 14:20", sellDate: "2026-05-08 09:58" },
];

describe("量化收益计算", () => {
  it("按买入价计算正负单笔收益率，并保护零买入价", () => {
    expect(getTradeReturn(sampleTrades[0])).toBeCloseTo(0.1, 12);
    expect(getTradeReturn(sampleTrades[1])).toBeCloseTo(-0.1, 12);
    expect(getTradeReturn({ buyPrice: 0, sellPrice: 100 })).toBe(0);
  });

  it("收益率展示向零截断到两位小数，不进行四舍五入", () => {
    expect(formatPercent(0.099399)).toBe("9.93%");
    expect(formatPercent(-0.099399)).toBe("-9.93%");
    expect(formatPercent(0.12349, 3)).toBe("12.349%");
  });

  it("按卖出日期时间和记录序号排序，逐笔累计收益率", () => {
    const trend = calculateTrend(sampleTrades);
    expect(trend.map(point => point.id)).toEqual([2, 3]);
    expect(trend[0]?.cumulativeReturn).toBeCloseTo(-0.1, 12);
    expect(trend[1]?.cumulativeReturn).toBeCloseTo(0, 12);
  });

  it("汇总交易次数、盈亏金额、平均收益、最大收益和最终累计收益", () => {
    expect(calculateDashboardMetrics(sampleTrades)).toMatchObject({
      totalTrades: 2,
      totalProfit: -10,
      averageReturn: 0,
      maximumReturn: 0.1,
      finalCumulativeReturn: 0,
    });
  });

  it("将卖出字段为空的未平仓交易保留在原始记录中，但排除已实现收益指标与趋势", () => {
    const openTrade: QuantTrade = { id: 4, symbol: "OPEN.POS", stockName: "未平仓样例", buyPrice: 50, sellPrice: null, buyDate: "2026-05-10 13:45", sellDate: null };
    const allTrades = [...sampleTrades, openTrade];

    expect(getTradeReturn(openTrade)).toBe(0);
    expect(calculateTrend(allTrades).map(point => point.id)).not.toContain(openTrade.id);
    expect(calculateDashboardMetrics(allTrades)).toMatchObject({ totalTrades: 2, totalProfit: -10, finalCumulativeReturn: 0 });
  });

  it("重新填写卖出价后立即具备可显示的单笔收益率，但未填写卖出时间仍不计入已实现统计", () => {
    const repricedOpenTrade: QuantTrade = { id: 5, symbol: "REPRICE.OPEN", stockName: "回填卖出价样例", buyPrice: 80, sellPrice: 88, buyDate: "2026-05-11 09:30", sellDate: null };
    const allTrades = [...sampleTrades, repricedOpenTrade];

    expect(hasSellPrice(repricedOpenTrade)).toBe(true);
    expect(getTradeReturn(repricedOpenTrade)).toBeCloseTo(0.1, 12);
    expect(isRealizedTrade(repricedOpenTrade)).toBe(false);
    expect(calculateTrend(allTrades).map(point => point.id)).not.toContain(repricedOpenTrade.id);
    expect(calculateDashboardMetrics(allTrades)).toMatchObject({ totalTrades: 2, totalProfit: -10, finalCumulativeReturn: 0 });
  });

  it("在没有交易时返回零值指标", () => {
    expect(calculateDashboardMetrics([])).toEqual({
      totalTrades: 0,
      totalProfit: 0,
      averageReturn: 0,
      maximumReturn: 0,
      finalCumulativeReturn: 0,
    });
  });
});
