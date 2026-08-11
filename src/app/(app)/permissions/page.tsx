import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { ShieldCheck, UsersRound } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import {
  canManageUsers,
  normalizeUserRole,
  roleLabels,
  userRoles,
} from "@/lib/auth/permissions";
import { db, schema } from "@/lib/db";
import UserRoleSelect from "@/components/UserRoleSelect";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export default async function PermissionsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }
  if (!canManageUsers(currentUser)) {
    redirect("/projects");
  }

  const users = db
    .select()
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt))
    .all();
  const roleOptions = userRoles.map((role) => ({
    value: role,
    label: roleLabels[role],
  }));
  const roleCounts = users.reduce<Record<string, number>>((counts, user) => {
    const role = normalizeUserRole(user.role);
    counts[role] = (counts[role] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <div className="space-y-5 p-5">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck size={16} />
            权限管理
          </div>
          <h1 className="text-2xl font-semibold">成员角色</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            研发可参与评审但不能修改方案；访客仅可查看。
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
          {userRoles.map((role) => (
            <div key={role} className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-xs text-muted-foreground">{roleLabels[role]}</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {roleCounts[role] ?? 0}
              </div>
            </div>
          ))}
        </div>
      </header>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <UsersRound size={16} />
            全部成员
          </h2>
          <span className="rounded border border-border px-2 py-1 text-xs text-muted-foreground">
            {users.length} 人
          </span>
        </div>

        <div className="divide-y divide-border">
          {users.map((user) => {
            const role = normalizeUserRole(user.role);
            const isSelf = user.id === currentUser.id;
            return (
              <div
                key={user.id}
                className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_180px]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white"
                    style={{ background: user.avatarColor }}
                  >
                    {user.displayName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-sm font-medium">{user.displayName}</div>
                      {isSelf && (
                        <span className="rounded bg-accent px-2 py-0.5 text-xs text-primary">
                          当前账号
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{user.email}</span>
                      <span>加入于 {formatDate(user.createdAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-start md:justify-end">
                  <UserRoleSelect
                    userId={user.id}
                    currentRole={role}
                    roleOptions={roleOptions}
                    disabled={isSelf}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
