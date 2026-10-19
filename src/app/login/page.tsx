"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProductLogo from "@/components/ProductLogo";
import TenantSelect from "@/components/TenantSelect";
import type { TenantId } from "@/lib/tenants";

export default function LoginPage() {
  const [tenantId, setTenantId] = useState<TenantId>("cowork");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, tenantId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "登录失败");
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
          <p className="text-muted-foreground">登录到你的需求评审工作台</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-card p-6 rounded-xl border border-border">
          <TenantSelect value={tenantId} onChange={setTenantId} />
          <p className="text-xs text-muted-foreground">原有账号和团队资料请选择 Cowork需求空间。</p>
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
            {loading ? "登录中..." : "登录"}
          </button>
          <p className="text-sm text-center text-muted-foreground">
            还没有账号？
            <Link href="/register" className="text-primary hover:underline ml-1">
              注册
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
