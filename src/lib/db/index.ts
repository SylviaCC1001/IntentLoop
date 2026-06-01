import * as schema from "./schema";
import path from "path";
import fs from "fs";
import { drizzleNodeSqlite, NodeSqliteDatabase } from "./node-sqlite";

// 确保 data 目录存在
const dataDir = process.env.DATA_DIR || "./data";
const dbPath = process.env.DATABASE_URL || path.join(dataDir, "prd.db");

// 创建必要目录
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, "repos"), { recursive: true });
fs.mkdirSync(path.join(dataDir, "prototypes"), { recursive: true });

const sqlite = new NodeSqliteDatabase(dbPath);
sqlite.exec("PRAGMA busy_timeout = 10000");
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");

export const db = drizzleNodeSqlite(sqlite, { schema });
export { schema };
export default db;
