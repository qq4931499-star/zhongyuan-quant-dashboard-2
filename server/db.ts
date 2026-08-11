import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  dashboardSettings,
  InsertTrade,
  InsertUser,
  trades,
  users,
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { dedupeImportedTrades, type ImportTrade } from "@shared/tradeImport";
import { normalizeTradeDateTime } from "@shared/tradeImport";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

const initialSettings = {
  id: 1,
  title: "中圆量化 月度收益走势",
  subtitle: "（T+1操作）",
  startDate: "2026-05-01",
  endDate: "2026-05-31",
} as const;

const initialTrades: InsertTrade[] = [
  { symbol: "600519.SH", stockName: "贵州茅台", buyPrice: 1685.5, sellPrice: 1798.6, buyDate: "2026-05-06 09:35", sellDate: "2026-05-07 10:02" },
  { symbol: "300750.SZ", stockName: "宁德时代", buyPrice: 193.45, sellPrice: 206.91, buyDate: "2026-05-07 10:18", sellDate: "2026-05-08 09:51" },
  { symbol: "601888.SH", stockName: "中国中免", buyPrice: 89.21, sellPrice: 95.98, buyDate: "2026-05-08 13:22", sellDate: "2026-05-09 14:06" },
  { symbol: "000858.SZ", stockName: "五粮液", buyPrice: 152.3, sellPrice: 161.91, buyDate: "2026-05-09 09:46", sellDate: "2026-05-10 10:15" },
  { symbol: "002594.SZ", stockName: "比亚迪", buyPrice: 245.6, sellPrice: 260.64, buyDate: "2026-05-10 14:08", sellDate: "2026-05-13 09:38" },
];

async function ensureDashboardSeed() {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用");

  await db.insert(dashboardSettings).values(initialSettings).onDuplicateKeyUpdate({
    set: { id: initialSettings.id },
  });

  const existingTrades = await db.select({ id: trades.id }).from(trades).limit(1);
  if (existingTrades.length === 0) {
    await db.insert(trades).values(initialTrades);
  }
  return db;
}

export async function getDashboardSnapshot() {
  const db = await ensureDashboardSeed();
  const [settings] = await db.select().from(dashboardSettings).where(eq(dashboardSettings.id, 1)).limit(1);
  const records = await db.select().from(trades).orderBy(desc(trades.buyDate), desc(trades.id));
  return { settings, trades: records.map(record => ({ ...record, buyDate: normalizeTradeDateTime(record.buyDate), sellDate: record.sellDate ? normalizeTradeDateTime(record.sellDate) : null })) };
}

export async function updateDashboardSettings(values: {
  title?: string;
  subtitle?: string;
  startDate?: string;
  endDate?: string;
}) {
  const db = await ensureDashboardSeed();
  await db.update(dashboardSettings).set(values).where(eq(dashboardSettings.id, 1));
  const [settings] = await db.select().from(dashboardSettings).where(eq(dashboardSettings.id, 1)).limit(1);
  return settings;
}

export async function createTrade(values: InsertTrade) {
  const db = await ensureDashboardSeed();
  const result = await db.insert(trades).values(values);
  const [record] = await db.select().from(trades).where(eq(trades.id, Number(result[0].insertId))).limit(1);
  return record;
}

export async function bulkImportTrades(values: ImportTrade[]) {
  const db = await ensureDashboardSeed();
  const existing = await db.select({
    symbol: trades.symbol,
    stockName: trades.stockName,
    buyPrice: trades.buyPrice,
    sellPrice: trades.sellPrice,
    buyDate: trades.buyDate,
    sellDate: trades.sellDate,
  }).from(trades);
  const { accepted, duplicateIndexes } = dedupeImportedTrades(values, existing);

  if (accepted.length > 0) {
    await db.insert(trades).values(accepted);
  }

  return {
    imported: accepted.length,
    skipped: duplicateIndexes.length,
    skippedRows: duplicateIndexes.map(index => index + 1),
  } as const;
}

export async function updateTrade(id: number, values: Partial<InsertTrade> & { sellPrice?: number | null; sellDate?: string | null }) {
  const db = await ensureDashboardSeed();
  await db.update(trades).set(values as Partial<InsertTrade>).where(eq(trades.id, id));
  const [record] = await db.select().from(trades).where(eq(trades.id, id)).limit(1);
  return record;
}

export async function deleteTrade(id: number) {
  const db = await ensureDashboardSeed();
  await db.delete(trades).where(eq(trades.id, id));
  return { success: true } as const;
}
