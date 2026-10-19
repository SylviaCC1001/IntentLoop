import * as schema from "./schema";
import path from "path";
import fs from "fs";
import { drizzleNodeSqlite, NodeSqliteDatabase } from "./node-sqlite";
import type { TenantId } from "@/lib/tenants";
import { getTenantPaths } from "@/lib/tenants/storage";

export type TenantDatabase = ReturnType<typeof drizzleNodeSqlite>;
const databases = new Map<TenantId, TenantDatabase>();

export function getTenantDatabase(tenantId: TenantId): TenantDatabase {
  const existing = databases.get(tenantId);
  if (existing) return existing;
  const { dataDir, dbPath } = getTenantPaths(tenantId);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  for (const dir of ["repos", "prototypes", "appendices"]) {
    fs.mkdirSync(path.join(dataDir, dir), { recursive: true });
  }
  const sqlite = new NodeSqliteDatabase(dbPath);
  sqlite.exec("PRAGMA busy_timeout = 10000");
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const database = drizzleNodeSqlite(sqlite, { schema });
  databases.set(tenantId, database);
  return database;
}

export { schema };
