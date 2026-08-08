import { describe, expect, it } from "vitest";
import { calculateDashboardMetrics, calculateTrend, getTradeReturn, type QuantTrade } from "./quant";

const sampleTrades: QuantTrade[] = [
  { id: 3, symbol: "BUY.GAIN", stockName: "上涨样例", buyPrice: 100, sellPrice: 110, buyDate: "2026-05-08", sellDate: "2026-05-09" },
  { id: 2, symbol: "SELL.LOSS", stockName: "下跌样例", buyPrice: 200, sellPrice: 180, buyDate: "2026-05-07", sellDate: "2026-05-08" },
];

describe("量化收益计算", () => {
  it("按买入价计算正负单笔收益率，并保护零买入价", () => {
    expect(getTradeReturn(sampleTrades[0])).toBeCloseTo(0.1, 12);
    expect(getTradeReturn(sampleTrades[1])).toBeCloseTo(-0.1, 12);
    expect(getTradeReturn({ buyPrice: 0, sellPrice: 100 })).toBe(0);
  });

  it("按卖出日期和记录序号排序，逐笔累计收益率", () => {
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
