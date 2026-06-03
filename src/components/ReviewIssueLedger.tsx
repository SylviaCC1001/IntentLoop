"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CircleDot,
  ExternalLink,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";
import {
  reviewStatusLabels,
  type ReviewIssueStatus,
  type SolutionReviewIssue,
} from "@/lib/solution-review/types";

type ReviewIssueLedgerProps = {
  issues: SolutionReviewIssue[];
  /** 嵌入 Sheet 时隐藏自带标题头与外层卡片边框，避免与 SheetHeader 重复 */
  embedded?: boolean;
};

type IssueFilter = "all" | "open" | "handled" | "closed";

const filterLabels: Record<IssueFilter, string> = {
  all: "全部",
  open: "待处理",
  handled: "已处理",
  closed: "已关闭",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusClass(status: ReviewIssueStatus) {
  if (status === "open") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "handled") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function ReviewIssueLedger({ issues, embedded = false }: ReviewIssueLedgerProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<IssueFilter>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const counts = useMemo(() => {
    return issues.reduce(
      (acc, issue) => {
        if (issue.status === "open") acc.open += 1;
        else if (issue.status === "handled") acc.handled += 1;
        else acc.closed += 1;
        acc.all += 1;
        return acc;
      },
      { all: 0, open: 0, handled: 0, closed: 0 }
    );
  }, [issues]);

  const visibleIssues = issues.filter((issue) => {
    if (filter === "all") return true;
    if (filter === "closed") {
      return issue.status === "closed" || issue.status === "resolved";
    }
    return issue.status === filter;
  });

  async function updateStatus(issueId: string, status: ReviewIssueStatus) {
    if (updatingId) return;
    setUpdatingId(issueId);
    setError("");
    try {
      const response = await fetch(`/api/comments/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "更新评审问题失败");
        return;
      }
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <section
      data-review-issue-ledger="true"
      className={
        embedded
          ? "flex min-h-0 flex-1 flex-col"
          : "overflow-hidden rounded-xl border border-border bg-card shadow-elev-1"
      }
    >
      {embedded ? (
        <div className="flex flex-wrap gap-2 border-b border-border px-5 py-3">
          {(["all", "open", "handled", "closed"] as IssueFilter[]).map((item) => {
            const count = item === "closed" ? counts.closed : counts[item];
            return (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                  filter === item
                    ? "border-primary bg-accent text-primary"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {filterLabels[item]} {count}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-3 border-b border-border bg-background px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">评审问题台账</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              汇总 PRD 和原型上的所有评审意见，集中推进处理状态。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", "open", "handled", "closed"] as IssueFilter[]).map((item) => {
              const count = item === "closed" ? counts.closed : counts[item];
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                    filter === item
                      ? "border-primary bg-accent text-primary"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {filterLabels[item]} {count}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div className="border-b border-border bg-red-50 px-5 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className={embedded ? "flex-1 divide-y divide-border overflow-auto" : "divide-y divide-border"}>
        {visibleIssues.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            当前筛选下没有评审问题。
          </div>
        ) : (
          visibleIssues.map((issue) => {
            const busy = updatingId === issue.id;
            return (
              <article key={issue.id} className="bg-background/70 px-5 py-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(issue.status)}`}
                      >
                        {reviewStatusLabels[issue.status]}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {issue.documentType}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {issue.documentTitle} · {issue.anchorLabel}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                      {issue.body}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{issue.authorName}</span>
                      <span>·</span>
                      <span>{formatDate(issue.createdAt)}</span>
                      <span>·</span>
                      <span>{issue.versionMessage}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link
                      href={issue.href}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      <ExternalLink size={13} />
                      定位
                    </Link>
                    {issue.status !== "open" && (
                      <button
                        type="button"
                        onClick={() => updateStatus(issue.id, "open")}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                      >
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                        重开
                      </button>
                    )}
                    {issue.status === "open" && (
                      <button
                        type="button"
                        onClick={() => updateStatus(issue.id, "handled")}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                        标记已处理
                      </button>
                    )}
                    {issue.status === "handled" && (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700">
                        <CircleDot size={13} />
                        等待确认
                      </span>
                    )}
                    {issue.status !== "closed" && issue.status !== "resolved" && (
                      <button
                        type="button"
                        onClick={() => updateStatus(issue.id, "closed")}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                        关闭
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
