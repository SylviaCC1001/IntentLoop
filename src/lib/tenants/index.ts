export const tenants = [
  { id: "procurement", name: "招采需求空间" },
  { id: "cowork", name: "Cowork需求空间" },
] as const;

export type TenantId = (typeof tenants)[number]["id"];
export const TENANT_COOKIE = "prd_tenant";

export function getTenant(id: unknown) {
  return tenants.find((tenant) => tenant.id === id) ?? null;
}
