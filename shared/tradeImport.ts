import type { QuantTrade } from "./quant";
import { z } from "zod";

export type ImportTrade = Omit<QuantTrade, "id">;
export type ImportRowIssue = { row: number; messages: string[] };

export function normalizeTradeDateTime(value: string) {
  const trimmed = value.trim().replace("T", " ").replace(/\s+/g, " ");
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed} 00:00` : trimmed;
}

function isCalendarDateTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) return false;
  const [datePart, timePart] = value.split(" ");
  const [year, month, day] = datePart!.split("-").map(Number);
  const [hours, minutes] = timePart!.split(":").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date.getUTCHours() === hours && date.getUTCMinutes() === minutes;
}

const importDateTimeSchema = z.string().trim().transform(normalizeTradeDateTime).refine(isCalendarDateTime, "交易时间应为有效的 YYYY-MM-DD HH:mm");

export const tradeImportRowSchema = z.object({
  symbol: z.string().trim().min(1, "股票代码不能为空").max(32, "股票代码不得超过 32 个字符").transform(value => value.toUpperCase()),
  stockName: z.string().trim().min(1, "股票名称不能为空").max(80, "股票名称不得超过 80 个字符"),
  buyPrice: z.number().positive("买入价必须大于 0"),
  sellPrice: z.number().positive("卖出价必须大于 0").nullable().optional().transform(value => value ?? null),
  buyDate: importDateTimeSchema,
  sellDate: importDateTimeSchema.nullable().optional().transform(value => value ?? null),
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
