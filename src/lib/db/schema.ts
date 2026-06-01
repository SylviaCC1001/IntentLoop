import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ========== 用户 ==========
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  avatarColor: text("avatar_color").notNull(), // 头像背景色(hex)
  role: text("role", { enum: ["admin", "member"] })
    .notNull()
    .default("member"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ========== 项目 ==========
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#6366f1"), // 项目主色
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ========== 文档 ==========
// type:
//   md      - 在线编辑的 Markdown 文档
//   html    - 单文件 HTML 原型
//   html-zip - 多文件 HTML 原型(zip 上传)
//   appendix - 附录说明附件(不展示历史版本)
// status:
//   draft     - 草稿
//   reviewing - 评审中
//   published - 已发布
//   archived  - 已归档
export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  type: text("type", { enum: ["md", "html", "html-zip", "appendix"] }).notNull(),
  status: text("status", {
    enum: ["draft", "reviewing", "published", "archived"],
  })
    .notNull()
    .default("draft"),
  priority: text("priority", { enum: ["P0", "P1", "P2", "P3"] })
    .notNull()
    .default("P2"),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  currentVersionId: text("current_version_id"),
  description: text("description"), // 简短描述,列表展示
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ========== 版本 ==========
// 每次保存 = 一个新版本(对应 git commit)
// 文件存储:
//   md: content 字段(数据库)
//   html: content 字段(数据库,单 HTML 内容)
//   html-zip: storagePath 字段(./data/prototypes/{docId}/{versionId}/)
export const versions = sqliteTable("versions", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  commitSha: text("commit_sha"), // git commit sha
  message: text("message").notNull().default(""), // 类似 commit message
  content: text("content"), // md 或 html 的文本内容
  storagePath: text("storage_path"), // html-zip 的解压目录(相对 DATA_DIR)
  size: integer("size").notNull().default(0), // 字节
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ========== 评论(行级 + 整篇) ==========
// anchorType:
//   doc     - 整篇评论
//   block   - MD 段落(用 heading id 或段落 hash 锚定)
//   element - HTML 元素(用 selector + textHash)
export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  versionId: text("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  parentId: text("parent_id"), // 树形回复
  anchorType: text("anchor_type", { enum: ["doc", "block", "element"] })
    .notNull()
    .default("doc"),
  anchorData: text("anchor_data", { mode: "json" })
    .$type<CommentAnchor>()
    .notNull(),
  body: text("body").notNull(),
  status: text("status", { enum: ["open", "handled", "closed", "resolved"] })
    .notNull()
    .default("open"),
  // 评论是否已"漂移"到了新版本但找不到锚点
  isOrphaned: integer("is_orphaned", { mode: "boolean" })
    .notNull()
    .default(false),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// 评论锚点数据结构
export type CommentAnchor =
  | { type: "doc" }
  | {
      type: "block";
      blockId: string; // heading id 或段落唯一 id
      textHash: string; // 段落文本的 hash,用于版本漂移
      preview: string; // 选中文本预览,最多 80 字
    }
  | {
      type: "element";
      selector: string; // 例如 'button#login'
      textHash: string;
      preview: string;
      kind?: "selection" | "prototype-rect" | "prototype-element";
      blockId?: string;
      selectedText?: string;
      startOffset?: number;
      endOffset?: number;
      pagePath?: string;
      viewKey?: string;
      pageKey?: string;
      viewport?: { w: number; h: number };
      bbox?: { x: number; y: number; w: number; h: number }; // iframe 内坐标(可选)
      domAnchor?: {
        selector: string;
        xpath?: string;
        tagName: string;
        id?: string;
        className?: string;
        role?: string;
        text?: string;
        fingerprint: string;
      };
    };

// ========== 状态变更日志 ==========
export const statusLogs = sqliteTable("status_logs", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  note: text("note"),
  changedBy: text("changed_by")
    .notNull()
    .references(() => users.id),
  changedAt: integer("changed_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ========== Session(自实现简单 session) ==========
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ========== 类型导出 ==========
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type Version = typeof versions.$inferSelect;
export type NewVersion = typeof versions.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type StatusLog = typeof statusLogs.$inferSelect;
