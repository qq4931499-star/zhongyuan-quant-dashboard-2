import { describe, expect, it } from "vitest";
import { deriveExportPeriod, filterTradesForExportRange, getPresetExportDateRange, isValidExportDateRange } from "./exportDateRange";

const trades = [
  { buyDate: "2026-08-03 09:30" },
  { buyDate: "2026-08-08 09:30" },
  { buyDate: "2026-08-14 09:30" },
];

describe("导出日期范围", () => {
  it("生成当日、本周和当月快捷范围", () => {
    expect(getPresetExportDateRange("today", "2026-08-14")).toEqual({ startDate: "2026-08-14", endDate: "2026-08-14" });
    expect(getPresetExportDateRange("week", "2026-08-14")).toEqual({ startDate: "2026-08-10", endDate: "2026-08-14" });
    expect(getPresetExportDateRange("month", "2026-08-14")).toEqual({ startDate: "2026-08-01", endDate: "2026-08-14" });
  });

  it("按买入日期筛选并为全部交易推导完整统计区间", () => {
    const range = { startDate: "2026-08-08", endDate: "2026-08-14" };
    expect(filterTradesForExportRange(trades, range)).toHaveLength(2);
    expect(deriveExportPeriod(trades, null, { startDate: "2026-01-01", endDate: "2026-12-31" })).toEqual({ startDate: "2026-08-03", endDate: "2026-08-14" });
  });

  it("拒绝倒置或格式错误的手动范围", () => {
    expect(isValidExportDateRange({ startDate: "2026-08-14", endDate: "2026-08-08" })).toBe(false);
    expect(isValidExportDateRange({ startDate: "2026/08/08", endDate: "2026-08-14" })).toBe(false);
  });
});
