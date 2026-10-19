/**
 * 数据库迁移脚本 - 直接建表(MVP 用 push,不走 drizzle migration 文件)
 * 运行: npx tsx src/lib/db/migrate.ts
 */
import path from "path";
import fs from "fs";
import { NodeSqliteDatabase } from "./node-sqlite";
import { tenants } from "../tenants";
import { getTenantPaths } from "../tenants/storage";

for (const tenant of tenants) {
  const { dataDir, dbPath } = getTenantPaths(tenant.id);

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "repos"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "prototypes"), { recursive: true });

  const db = new NodeSqliteDatabase(dbPath);
  db.exec("PRAGMA busy_timeout = 10000");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_color TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'product',
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT NOT NULL DEFAULT '#6366f1',
    status TEXT NOT NULL DEFAULT 'draft',
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );

  CREATE TABLE IF NOT EXISTS project_reads (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_count INTEGER NOT NULL DEFAULT 1,
    first_read_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    last_read_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    UNIQUE(project_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    priority TEXT NOT NULL DEFAULT 'P2',
    tags TEXT NOT NULL DEFAULT '[]',
    owner_id TEXT NOT NULL REFERENCES users(id),
    current_version_id TEXT,
    description TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );

  CREATE TABLE IF NOT EXISTS versions (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    commit_sha TEXT,
    message TEXT NOT NULL DEFAULT '',
    content TEXT,
    storage_path TEXT,
    size INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
    parent_id TEXT,
    anchor_type TEXT NOT NULL DEFAULT 'doc',
    anchor_data TEXT NOT NULL DEFAULT '{"type":"doc"}',
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    is_orphaned INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );

  CREATE TABLE IF NOT EXISTS status_logs (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    note TEXT,
    changed_by TEXT NOT NULL REFERENCES users(id),
    changed_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );

CREATE TABLE IF NOT EXISTS prototype_grants (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prototype_grants_expires ON prototype_grants(expires_at);

  -- 索引
  CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
  CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
  CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
  CREATE INDEX IF NOT EXISTS idx_project_reads_project ON project_reads(project_id);
  CREATE INDEX IF NOT EXISTS idx_project_reads_user ON project_reads(user_id);
  CREATE INDEX IF NOT EXISTS idx_versions_document ON versions(document_id);
  CREATE INDEX IF NOT EXISTS idx_comments_document ON comments(document_id);
  CREATE INDEX IF NOT EXISTS idx_comments_version ON comments(version_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);

  const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{
    name: string;
  }>;
  if (!userColumns.some((column) => column.name === "role")) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'product'");
  }

  db.exec("UPDATE users SET role = 'product' WHERE role = 'member'");

  const projectColumns = db.prepare("PRAGMA table_info(projects)").all() as Array<{
    name: string;
  }>;
  if (!projectColumns.some((column) => column.name === "status")) {
    db.exec("ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'");
  }

  console.log("✅ 空间数据库迁移完成:", tenant.name, dbPath);
  db.close();
}
