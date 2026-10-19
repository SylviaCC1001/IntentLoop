import path from "path";
import type { TenantId } from ".";

export function getTenantPaths(tenantId: TenantId) {
  const root = process.env.DATA_DIR || "./data";
  // Cowork retains the existing database, files and historical links in place.
  const dataDir = tenantId === "cowork"
    ? root
    : path.join(root, "tenants", tenantId);
  const dbPath = tenantId === "cowork"
    ? process.env.DATABASE_URL || path.join(root, "prd.db")
    : path.join(dataDir, "prd.db");
  return { dataDir, dbPath };
}
