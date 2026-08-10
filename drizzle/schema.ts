import { double, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Shared page copy and display-only statistical period. This table deliberately contains one row. */
export const dashboardSettings = mysqlTable("dashboardSettings", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 120 }).notNull(),
  subtitle: varchar("subtitle", { length: 120 }).notNull(),
  startDate: varchar("startDate", { length: 10 }).notNull(),
  endDate: varchar("endDate", { length: 10 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** A public, editable record of an individual trade; sell fields are null while a position remains open. */
export const trades = mysqlTable("trades", {
  id: int("id").autoincrement().primaryKey(),
  symbol: varchar("symbol", { length: 32 }).notNull(),
  stockName: varchar("stockName", { length: 80 }).notNull(),
  buyPrice: double("buyPrice").notNull(),
  sellPrice: double("sellPrice"),
  buyDate: varchar("buyDate", { length: 16 }).notNull(),
  sellDate: varchar("sellDate", { length: 16 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DashboardSettings = typeof dashboardSettings.$inferSelect;
export type InsertDashboardSettings = typeof dashboardSettings.$inferInsert;
export type Trade = typeof trades.$inferSelect;
export type InsertTrade = typeof trades.$inferInsert;
