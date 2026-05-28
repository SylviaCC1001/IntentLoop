import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

// 确保 data 目录存在
const dataDir = process.env.DATA_DIR || "./data";
const dbPath = process.env.DATABASE_URL || path.join(dataDir, "prd.db");

// 创建必要目录
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, "repos"), { recursive: true });
fs.mkdirSync(path.join(dataDir, "prototypes"), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };
export default db;
