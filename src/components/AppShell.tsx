"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  FolderKanban,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Trello,
} from "lucide-react";
import type { User } from "@/lib/db/schema";

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

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const navItems = [
    { href: "/projects", label: "需求方案", icon: FolderKanban },
    { href: "/board", label: "评审看板", icon: Trello },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* 侧栏 */}
      <aside
        data-app-sidebar-collapsible="true"
        data-app-sidebar-state={collapsed ? "collapsed" : "expanded"}
        className={`flex shrink-0 flex-col border-r border-border bg-white/90 shadow-sm backdrop-blur transition-[width] duration-200 ${
          collapsed ? "w-16" : "w-56"
        }`}
      >
        <div className="border-b border-border p-3">
          <div className="flex items-center justify-between gap-2">
          <Link
            href="/projects"
            className={`flex min-w-0 items-center gap-2 ${
              collapsed ? "justify-center" : ""
            }`}
            title="PRD Hub"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground shadow-sm shadow-primary/20">
              P
            </div>
            {!collapsed && <span className="truncate font-semibold">PRD Hub</span>}
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={collapsed ? "展开导航" : "收起导航"}
            title={collapsed ? "展开导航" : "收起导航"}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          </div>
        </div>

        <nav className="flex-1 p-2">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`mb-1 flex items-center rounded-md py-2 text-sm ${
                  collapsed ? "justify-center px-2" : "gap-2 px-3"
                } ${
                  active
                    ? "bg-accent text-primary font-medium"
                    : "hover:bg-muted"
                }`}
              >
                <Icon size={16} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div
            className={`mb-2 flex items-center gap-2 ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white"
              style={{ background: user.avatarColor }}
              title={`${user.displayName} · ${user.role === "admin" ? "管理员" : "成员"}`}
            >
              {user.displayName.slice(0, 1).toUpperCase()}
            </div>
            {!collapsed && <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">
                {user.displayName}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {user.role === "admin" ? "管理员" : "成员"}
              </div>
            </div>}
          </div>
          <button
            onClick={handleLogout}
            className={`flex w-full items-center justify-center rounded-md py-1.5 text-sm text-muted-foreground hover:bg-muted ${
              collapsed ? "px-2" : "gap-2 px-3"
            }`}
            title="登出"
          >
            <LogOut size={14} />
            {!collapsed && "登出"}
          </button>
        </div>
      </aside>

      {/* 主内容 */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
