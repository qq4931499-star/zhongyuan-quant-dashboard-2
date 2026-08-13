import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { bulkImportTrades, createTrade, deleteTrade, getDashboardSnapshot, updateDashboardSettings, updateTrade } from "./db";
import { z } from "zod";
import { normalizeTradeDateTime, tradeImportRowSchema, validateTradeImportRows } from "@shared/tradeImport";
import { parseAStockIdentitySearch, parseAStockSearchCandidates, type StockIdentity, type StockSearchCandidate } from "@shared/stockIdentity";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD");
const tradeFields = tradeImportRowSchema;
const tradeDateTimeSchema = z.string().trim().transform(normalizeTradeDateTime).refine(value => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (!match) return false;
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day) && date.getUTCHours() === Number(hour) && date.getUTCMinutes() === Number(minute);
}, "交易时间应为有效的 YYYY-MM-DD HH:mm");
const updateTradeFields = z.object({
  symbol: z.string().trim().min(1, "股票代码不能为空").max(32, "股票代码不得超过 32 个字符").transform(value => value.toUpperCase()).optional(),
  stockName: z.string().trim().min(1, "股票名称不能为空").max(80, "股票名称不得超过 80 个字符").optional(),
  buyPrice: z.number().positive("买入价必须大于 0").optional(),
  sellPrice: z.number().positive("卖出价必须大于 0").nullable().optional(),
  buyDate: tradeDateTimeSchema.optional(),
  sellDate: tradeDateTimeSchema.nullable().optional(),
}).refine(values => Object.keys(values).length > 0, "至少提交一个交易字段");

const stockIdentityCache = new Map<string, { value: StockIdentity | null; expiresAt: number }>();
const stockCandidateCache = new Map<string, { value: StockSearchCandidate[]; expiresAt: number }>();

async function lookupAStockIdentity(query: string): Promise<StockIdentity | null> {
  const normalizedQuery = query.trim();
  const cacheKey = normalizedQuery.toLowerCase();
  const cached = stockIdentityCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const searchTerms = [normalizedQuery, normalizedQuery.slice(0, 2)].filter((term, index, terms) => term && terms.indexOf(term) === index);
  let result: StockIdentity | null = null;
  for (const term of searchTerms) {
    const url = new URL("https://smartbox.gtimg.cn/s3/");
    url.searchParams.set("q", term);
    url.searchParams.set("t", "all");
    const response = await fetch(url, { signal: AbortSignal.timeout(4_000) });
    if (!response.ok) continue;
    const payload = await response.text();
    const match = parseAStockIdentitySearch(payload, normalizedQuery);
    if (match) { result = match; break; }
  }
  stockIdentityCache.set(cacheKey, { value: result, expiresAt: Date.now() + 10 * 60_000 });
  return result;
}

async function searchAStockCandidates(query: string): Promise<StockSearchCandidate[]> {
  const normalizedQuery = query.trim();
  const cacheKey = normalizedQuery.toLowerCase();
  const cached = stockCandidateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const searchTerms = [normalizedQuery, normalizedQuery.slice(0, 2)].filter((term, index, terms) => term && terms.indexOf(term) === index);
  const candidates = new Map<string, StockSearchCandidate>();
  for (const term of searchTerms) {
    const url = new URL("https://smartbox.gtimg.cn/s3/");
    url.searchParams.set("q", term);
    url.searchParams.set("t", "all");
    const response = await fetch(url, { signal: AbortSignal.timeout(4_000) });
    if (!response.ok) continue;
    parseAStockSearchCandidates(await response.text()).forEach(candidate => candidates.set(candidate.symbol, candidate));
  }
  const normalizedLower = normalizedQuery.toLowerCase();
  const result = Array.from(candidates.values())
    .filter(candidate => candidate.symbol.includes(normalizedQuery) || candidate.stockName.includes(normalizedQuery) || candidate.pinyin.toLowerCase().includes(normalizedLower))
    .slice(0, 8);
  stockCandidateCache.set(cacheKey, { value: result, expiresAt: Date.now() + 2 * 60_000 });
  return result;
}

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
    lookupStockIdentity: publicProcedure
      .input(z.object({ query: z.string().trim().min(1, "请输入股票代码或名称").max(80, "股票代码或名称不得超过 80 个字符") }))
      .query(async ({ input }) => {
        try {
          return await lookupAStockIdentity(input.query);
        } catch {
          return null;
        }
      }),
    searchStockCandidates: publicProcedure
      .input(z.object({ query: z.string().trim().min(1, "请输入股票代码、名称或拼音缩写").max(80, "搜索关键词不得超过 80 个字符") }))
      .query(async ({ input }) => {
        try {
          return await searchAStockCandidates(input.query);
        } catch {
          return [];
        }
      }),
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
      .input(z.object({ id: z.number().int().positive(), values: updateTradeFields }))
      .mutation(({ input }) => updateTrade(input.id, input.values)),
    deleteTrade: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input }) => deleteTrade(input.id)),
  }),
});

export type AppRouter = typeof appRouter;
