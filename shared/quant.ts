export type QuantTrade = {
  id: number;
  symbol: string;
  stockName: string;
  buyPrice: number;
  sellPrice: number | null;
  buyDate: string;
  sellDate: string | null;
};

export type TrendPoint = {
  id: number;
  date: string;
  symbol: string;
  returnRate: number;
  cumulativeReturn: number;
};

export type DashboardMetrics = {
  totalTrades: number;
  totalProfit: number;
  averageReturn: number;
  maximumReturn: number;
  finalCumulativeReturn: number;
};

export const isRealizedTrade = (trade: Pick<QuantTrade, "sellPrice" | "sellDate">) =>
  typeof trade.sellPrice === "number" && Boolean(trade.sellDate);

export const getTradeReturn = (trade: Pick<QuantTrade, "buyPrice" | "sellPrice">) =>
  trade.buyPrice > 0 && typeof trade.sellPrice === "number" ? (trade.sellPrice - trade.buyPrice) / trade.buyPrice : 0;

export function calculateTrend(trades: QuantTrade[]): TrendPoint[] {
  let cumulativeReturn = 0;
  return trades.filter(isRealizedTrade)
    .sort((a, b) => a.sellDate!.localeCompare(b.sellDate!) || a.id - b.id)
    .map(trade => {
      const returnRate = getTradeReturn(trade);
      cumulativeReturn += returnRate;
      return {
        id: trade.id,
        date: trade.sellDate!,
        symbol: trade.symbol,
        returnRate,
        cumulativeReturn,
      };
    });
}

export function calculateDashboardMetrics(trades: QuantTrade[]): DashboardMetrics {
  const realizedTrades = trades.filter(isRealizedTrade);
  const returns = realizedTrades.map(getTradeReturn);
  const trend = calculateTrend(realizedTrades);
  const totalProfit = realizedTrades.reduce((sum, trade) => sum + trade.sellPrice! - trade.buyPrice, 0);
  return {
    totalTrades: realizedTrades.length,
    totalProfit,
    averageReturn: returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0,
    maximumReturn: returns.length ? Math.max(...returns) : 0,
    finalCumulativeReturn: trend.at(-1)?.cumulativeReturn ?? 0,
  };
}

export const formatPercent = (value: number, digits = 2) => `${(value * 100).toFixed(digits)}%`;

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(value);
