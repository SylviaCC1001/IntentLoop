"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type RoleOption = {
  value: string;
  label: string;
};

type UserRoleSelectProps = {
  userId: string;
  currentRole: string;
  roleOptions: RoleOption[];
  disabled?: boolean;
};

export default function UserRoleSelect({
  userId,
  currentRole,
  roleOptions,
  disabled = false,
}: UserRoleSelectProps) {
  const router = useRouter();
  const [role, setRole] = useState(currentRole);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function updateRole(nextRole: string) {
    setRole(nextRole);
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRole(currentRole);
        setError(data.error || "保存失败");
        return;
      }
      router.refresh();
    } catch {
      setRole(currentRole);
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <select
        value={role}
        disabled={disabled || loading}
        onChange={(event) => updateRole(event.target.value)}
        className="h-9 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        aria-label="用户角色"
      >
        {roleOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <div className="text-xs text-destructive">{error}</div>}
    </div>
  );
}
