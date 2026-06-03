"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProductLogo from "@/components/ProductLogo";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName, password, inviteCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "注册失败");
        return;
      }
      router.push("/projects");
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <ProductLogo
            className="mb-2 justify-center gap-3"
            markClassName="h-10 w-10 rounded-lg"
            wordmarkClassName="text-3xl font-bold"
          />
          <p className="text-muted-foreground">创建账号</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-card p-6 rounded-xl border border-border">
          <div>
            <label className="block text-sm font-medium mb-1">显示名</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={32}
              className="w-full px-3 py-2 rounded-md border border-border bg-background focus:ring-2 focus:ring-primary outline-none"
              placeholder="张三"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-md border border-border bg-background focus:ring-2 focus:ring-primary outline-none"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2 rounded-md border border-border bg-background focus:ring-2 focus:ring-primary outline-none"
              placeholder="至少 6 位"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">邀请码</label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-md border border-border bg-background focus:ring-2 focus:ring-primary outline-none"
              placeholder=".env 中配置的 INVITE_CODE"
            />
          </div>
          {error && (
            <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 p-2 rounded">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "注册中..." : "注册"}
          </button>
          <p className="text-sm text-center text-muted-foreground">
            已有账号？
            <Link href="/login" className="text-primary hover:underline ml-1">
              登录
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
