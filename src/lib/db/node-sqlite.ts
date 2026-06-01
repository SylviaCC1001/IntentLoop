import {
  DatabaseSync,
  StatementSync,
  type SQLInputValue,
  type SQLOutputValue,
} from "node:sqlite";
import { DefaultLogger } from "drizzle-orm/logger";
import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
} from "drizzle-orm/relations";
import { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core/db";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core/dialect";
import { BetterSQLiteSession } from "drizzle-orm/better-sqlite3/session";

type DrizzleConfig = {
  schema?: Record<string, unknown>;
  logger?: boolean | unknown;
  casing?: "snake_case" | "camelCase";
};

type TransactionMode = "deferred" | "immediate" | "exclusive";

class NodeSqliteStatement {
  constructor(private readonly statement: StatementSync) {}

  run(...params: SQLInputValue[]) {
    return this.statement.run(...params);
  }

  all(...params: SQLInputValue[]) {
    return this.statement.all(...params);
  }

  get(...params: SQLInputValue[]) {
    return this.statement.get(...params) ?? undefined;
  }

  raw() {
    return {
      all: (...params: SQLInputValue[]) =>
        this.statement.all(...params).map((row) => this.toArray(row)),
      get: (...params: SQLInputValue[]) => {
        const row = this.statement.get(...params);
        return row ? this.toArray(row) : undefined;
      },
    };
  }

  private toArray(row: unknown): SQLOutputValue[] {
    if (!row || typeof row !== "object") {
      return [];
    }

    const record = row as Record<string, SQLOutputValue>;
    return this.statement.columns().map((column) => {
      const key = column.column ?? column.name;
      return key ? record[key] : null;
    });
  }
}

export class NodeSqliteDatabase {
  private readonly database: DatabaseSync;

  constructor(filename: string) {
    this.database = new DatabaseSync(filename);
  }

  exec(sql: string) {
    return this.database.exec(sql);
  }

  prepare(sql: string) {
    return new NodeSqliteStatement(this.database.prepare(sql));
  }

  close() {
    return this.database.close();
  }

  transaction<T>(fn: (tx: unknown) => T) {
    const run = (mode: TransactionMode) => (tx: unknown) => {
      this.exec(`begin ${mode}`);
      try {
        const result = fn(tx);
        this.exec("commit");
        return result;
      } catch (error) {
        this.exec("rollback");
        throw error;
      }
    };

    return {
      deferred: run("deferred"),
      immediate: run("immediate"),
      exclusive: run("exclusive"),
    };
  }
}

export function drizzleNodeSqlite(client: NodeSqliteDatabase, config: DrizzleConfig = {}) {
  const dialect = new SQLiteSyncDialect({ casing: config.casing });
  const logger =
    config.logger === true
      ? new DefaultLogger()
      : config.logger !== false
        ? config.logger
        : undefined;

  let schema;
  if (config.schema) {
    const tablesConfig = extractTablesRelationalConfig(
      config.schema,
      createTableRelationsHelpers
    );
    schema = {
      fullSchema: config.schema,
      schema: tablesConfig.tables,
      tableNamesMap: tablesConfig.tableNamesMap,
    };
  }

  const session = new BetterSQLiteSession(
    client as never,
    dialect,
    schema,
    { logger } as never
  );
  const db = new BaseSQLiteDatabase("sync", dialect, session, schema);
  (db as { $client?: NodeSqliteDatabase }).$client = client;
  return db;
}
