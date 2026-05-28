"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, FolderKanban, Trello, LogOut } from "lucide-react";
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

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const navItems = [
    { href: "/projects", label: "项目", icon: FolderKanban },
    { href: "/docs", label: "全部文档", icon: LayoutGrid },
    { href: "/board", label: "评审看板", icon: Trello },
  ];

  return (
    <div className="min-h-screen flex">
      {/* 侧栏 */}
      <aside className="w-56 border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border">
          <Link href="/projects" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold">
              P
            </div>
            <span className="font-semibold">PRD Hub</span>
          </Link>
        </div>

        <nav className="flex-1 p-2">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm mb-1 ${
                  active
                    ? "bg-accent text-primary font-medium"
                    : "hover:bg-muted"
                }`}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
              style={{ background: user.avatarColor }}
            >
              {user.displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {user.displayName}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {user.role === "admin" ? "管理员" : "成员"}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-sm rounded-md hover:bg-muted text-muted-foreground"
          >
            <LogOut size={14} />
            登出
          </button>
        </div>
      </aside>

      {/* 主内容 */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
