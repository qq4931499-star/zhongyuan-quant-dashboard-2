import type { QuantTrade } from "./quant";
import { z } from "zod";

export type ImportTrade = Omit<QuantTrade, "id">;
export type ImportRowIssue = { row: number; messages: string[] };

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const importDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD").refine(isCalendarDate, "日期不是有效的日历日期");

export const tradeImportRowSchema = z.object({
  symbol: z.string().trim().min(1, "股票代码不能为空").max(32, "股票代码不得超过 32 个字符").transform(value => value.toUpperCase()),
  stockName: z.string().trim().min(1, "股票名称不能为空").max(80, "股票名称不得超过 80 个字符"),
  buyPrice: z.number().positive("买入价必须大于 0"),
  sellPrice: z.number().positive("卖出价必须大于 0").nullable().optional().transform(value => value ?? null),
  buyDate: importDateSchema,
  sellDate: importDateSchema.nullable().optional().transform(value => value ?? null),
});

export function validateTradeImportRows(candidates: unknown[]) {
  const rows: ImportTrade[] = [];
  const issues: ImportRowIssue[] = [];
  candidates.forEach((candidate, index) => {
    const parsed = tradeImportRowSchema.safeParse(candidate);
    if (parsed.success) {
      rows.push(parsed.data);
      return;
    }
    issues.push({ row: index + 1, messages: parsed.error.issues.map(issue => issue.message) });
  });
  return { rows, issues };
}

export function getTradeImportKey(trade: ImportTrade) {
  return [trade.symbol.trim().toUpperCase(), trade.buyPrice, trade.sellPrice ?? "", trade.buyDate, trade.sellDate ?? ""].join("|");
}

export function dedupeImportedTrades(candidates: ImportTrade[], existing: ImportTrade[]) {
  const knownKeys = new Set(existing.map(getTradeImportKey));
  const accepted: ImportTrade[] = [];
  const duplicateIndexes: number[] = [];

  candidates.forEach((trade, index) => {
    const key = getTradeImportKey(trade);
    if (knownKeys.has(key)) {
      duplicateIndexes.push(index);
      return;
    }
    knownKeys.add(key);
    accepted.push(trade);
  });

  return { accepted, duplicateIndexes };
}
