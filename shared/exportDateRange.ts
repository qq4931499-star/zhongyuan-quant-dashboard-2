import type { QuantTrade } from "./quant";

export type ExportDatePreset = "today" | "week" | "month" | "all" | "custom";

export type ExportDateRange = {
  startDate: string;
  endDate: string;
};

function shiftDate(date: string, amount: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function getPresetExportDateRange(preset: Exclude<ExportDatePreset, "custom">, today: string): ExportDateRange | null {
  if (preset === "all") return null;
  if (preset === "today") return { startDate: today, endDate: today };
  if (preset === "week") {
    const value = new Date(`${today}T00:00:00Z`);
    const daysSinceMonday = (value.getUTCDay() + 6) % 7;
    return { startDate: shiftDate(today, -daysSinceMonday), endDate: today };
  }
  return { startDate: `${today.slice(0, 7)}-01`, endDate: today };
}

export function isValidExportDateRange(range: ExportDateRange) {
  return /^\d{4}-\d{2}-\d{2}$/.test(range.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(range.endDate) && range.startDate <= range.endDate;
}

export function filterTradesForExportRange<T extends Pick<QuantTrade, "buyDate">>(trades: T[], range: ExportDateRange | null) {
  if (!range) return trades;
  return trades.filter(trade => {
    const date = trade.buyDate.slice(0, 10);
    return date >= range.startDate && date <= range.endDate;
  });
}

export function deriveExportPeriod<T extends Pick<QuantTrade, "buyDate">>(trades: T[], range: ExportDateRange | null, fallback: ExportDateRange): ExportDateRange {
  if (range) return range;
  const dates = trades.map(trade => trade.buyDate.slice(0, 10)).sort();
  return dates.length > 0 ? { startDate: dates[0]!, endDate: dates.at(-1)! } : fallback;
}
