import { cookies } from "next/headers";
import { getTenantDatabase } from "@/lib/db";
import { getTenant, TENANT_COOKIE } from ".";
import { getTenantPaths } from "./storage";

export async function getRequestContext() {
  const cookieStore = await cookies();
  // Existing sessions belong exclusively to Cowork.
  const tenant = getTenant(cookieStore.get(TENANT_COOKIE)?.value ?? "cowork");
  if (!tenant) throw new Error("UNAUTHORIZED");
  return { tenant, db: getTenantDatabase(tenant.id), ...getTenantPaths(tenant.id) };
}
