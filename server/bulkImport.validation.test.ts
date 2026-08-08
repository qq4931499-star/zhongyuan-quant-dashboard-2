import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

describe("dashboard.bulkImportTrades", () => {
  it("在写入数据库前返回每一条非法交易的行号与校验错误", async () => {
    const caller = appRouter.createCaller({} as never);
    const result = await caller.dashboard.bulkImportTrades({
      trades: [
        { symbol: "", stockName: "测试股票", buyPrice: 0, sellPrice: 10, buyDate: "2026/05/01", sellDate: "2026-05-02" },
        { symbol: "600000.SH", stockName: "测试股票", buyPrice: 10, sellPrice: -1, buyDate: "2026-05-01", sellDate: "2026-13-40" },
      ],
    });

    expect(result).toMatchObject({ imported: 0, skipped: 0 });
    expect(result.issues.map(issue => issue.row)).toEqual([1, 2]);
    expect(result.issues[0]?.messages.join(" ")).toContain("股票代码不能为空");
    expect(result.issues[0]?.messages.join(" ")).toContain("买入价必须大于 0");
    expect(result.issues[1]?.messages.join(" ")).toContain("卖出价必须大于 0");
    expect(result.issues[1]?.messages.join(" ")).toContain("日期不是有效的日历日期");
  });
});
