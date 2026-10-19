"use client";

import { tenants, type TenantId } from "@/lib/tenants";

export default function TenantSelect({ value, onChange }: {
  value: TenantId;
  onChange: (value: TenantId) => void;
}) {
  return (
    <div>
      <label htmlFor="tenant" className="mb-1 block text-sm font-medium">需求空间</label>
      <select
        id="tenant"
        value={value}
        onChange={(event) => onChange(event.target.value as TenantId)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
      >
        {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
      </select>
    </div>
  );
}
