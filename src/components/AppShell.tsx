"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  FolderKanban,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Trello,
} from "lucide-react";
import type { User } from "@/lib/db/schema";
import {
  canManageUsers,
  normalizeUserRole,
  roleLabels,
} from "@/lib/auth/permissions";
import ProductLogo from "@/components/ProductLogo";

export default function AppShell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const normalizedRole = normalizeUserRole(user.role);
  const roleLabel = roleLabels[normalizedRole];

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const navItems = [
    { href: "/projects", label: "需求方案", icon: FolderKanban },
    { href: "/board", label: "评审看板", icon: Trello },
    ...(canManageUsers(user)
      ? [{ href: "/permissions", label: "权限管理", icon: ShieldCheck }]
      : []),
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      {/* 侧栏 */}
      <aside
        data-app-sidebar-collapsible="true"
        data-app-sidebar-state={collapsed ? "collapsed" : "expanded"}
        className={`flex w-full shrink-0 flex-col border-b border-border bg-white/90 shadow-sm backdrop-blur transition-[width] duration-200 md:min-h-screen md:border-b-0 md:border-r ${
          collapsed ? "md:w-16" : "md:w-56"
        }`}
      >
        <div className="border-b border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/projects"
              className={`flex min-w-0 items-center gap-2 ${
                collapsed ? "md:justify-center" : ""
              }`}
              title="IntentLoop"
            >
              <ProductLogo wordmarkClassName={collapsed ? "md:hidden" : undefined} />
            </Link>
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:inline-flex"
              aria-label={collapsed ? "展开导航" : "收起导航"}
              title={collapsed ? "展开导航" : "收起导航"}
            >
              {collapsed ? (
                <PanelLeftOpen size={16} />
              ) : (
                <PanelLeftClose size={16} />
              )}
            </button>
          </div>
        </div>

        <nav className="flex flex-none gap-1 overflow-x-auto p-2 md:block md:flex-1">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm md:mb-1 md:flex-none ${
                  collapsed ? "md:justify-center md:px-2" : "md:justify-start"
                } ${
                  active
                    ? "bg-accent text-primary font-medium"
                    : "hover:bg-muted"
                }`}
              >
                <Icon size={16} className="shrink-0" />
                <span className={`truncate ${collapsed ? "md:hidden" : ""}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="hidden border-t border-border p-3 md:block">
          <div
            className={`mb-2 flex items-center gap-2 ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white"
              style={{ background: user.avatarColor }}
              title={`${user.displayName} · ${roleLabel}`}
            >
              {user.displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className={`min-w-0 flex-1 ${collapsed ? "md:hidden" : ""}`}>
              <div className="text-sm font-medium truncate">
                {user.displayName}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {roleLabel}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className={`flex w-full items-center justify-center rounded-md py-1.5 text-sm text-muted-foreground hover:bg-muted ${
              collapsed ? "px-2" : "gap-2 px-3"
            }`}
            title="登出"
          >
            <LogOut size={14} />
            <span className={collapsed ? "md:hidden" : ""}>登出</span>
          </button>
        </div>
      </aside>

      {/* 主内容 */}
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
