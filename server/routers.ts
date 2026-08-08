import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { bulkImportTrades, createTrade, deleteTrade, getDashboardSnapshot, updateDashboardSettings, updateTrade } from "./db";
import { z } from "zod";
import { tradeImportRowSchema, validateTradeImportRows } from "@shared/tradeImport";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD");
const tradeFields = tradeImportRowSchema;

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  dashboard: router({
    snapshot: publicProcedure.query(() => getDashboardSnapshot()),
    updateSettings: publicProcedure
      .input(z.object({
        title: z.string().trim().min(1).max(120).optional(),
        subtitle: z.string().trim().max(120).optional(),
        startDate: dateSchema.optional(),
        endDate: dateSchema.optional(),
      }).refine(value => Object.keys(value).length > 0, "至少提交一个配置字段"))
      .mutation(({ input }) => updateDashboardSettings(input)),
    createTrade: publicProcedure.input(tradeFields).mutation(({ input }) => createTrade(input)),
    bulkImportTrades: publicProcedure
      .input(z.object({ trades: z.array(z.unknown()).min(1, "请至少导入一条交易记录").max(500, "单次最多导入 500 条交易记录") }))
      .mutation(async ({ input }) => {
        const validation = validateTradeImportRows(input.trades);
        if (validation.issues.length > 0) return { imported: 0, skipped: 0, skippedRows: [], issues: validation.issues };
        const result = await bulkImportTrades(validation.rows);
        return { ...result, issues: [] };
      }),
    updateTrade: publicProcedure
      .input(z.object({ id: z.number().int().positive(), values: tradeFields.partial() }))
      .mutation(({ input }) => updateTrade(input.id, input.values)),
    deleteTrade: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input }) => deleteTrade(input.id)),
  }),
});

export type AppRouter = typeof appRouter;
