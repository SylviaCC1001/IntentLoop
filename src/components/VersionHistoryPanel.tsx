"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GitCompareArrows, History, Loader2, RotateCcw } from "lucide-react";

type VersionSummary = {
  id: string;
  message: string;
  size: number;
  createdAt: string;
  isCurrent: boolean;
  hasTextContent: boolean;
};

type DiffPart = {
  value: string;
  added?: boolean;
  removed?: boolean;
};

type VersionHistoryPanelProps = {
  documentId: string;
  currentVersionId: string | null;
  versions: VersionSummary[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function shortId(value: string) {
  return value.slice(0, 8);
}

export default function VersionHistoryPanel({
  documentId,
  currentVersionId,
  versions,
}: VersionHistoryPanelProps) {
  const router = useRouter();
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffPart[]>([]);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? null,
    [selectedVersionId, versions]
  );

  async function compareWithCurrent(versionId: string) {
    if (!currentVersionId || versionId === currentVersionId) return;

    setLoadingDiff(true);
    setError("");
    try {
      const response = await fetch(
        `/api/documents/${documentId}/diff?from=${versionId}&to=${currentVersionId}`
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "对比失败");
        return;
      }

      setSelectedVersionId(versionId);
      setDiff(data.diff || []);
    } catch {
      setError("网络错误");
    } finally {
      setLoadingDiff(false);
    }
  }

  async function rollback(versionId: string) {
    if (rollingBackId) return;
    const confirmed = window.confirm("确定要回滚到这个版本吗？系统会创建一个新的当前版本。");
    if (!confirmed) return;

    setRollingBackId(versionId);
    setError("");
    try {
      const response = await fetch(
        `/api/documents/${documentId}/versions/${versionId}/rollback`,
        { method: "POST" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "回滚失败");
        return;
      }

      setSelectedVersionId(null);
      setDiff([]);
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setRollingBackId(null);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <History size={16} />
            版本历史
          </h2>
          <p className="text-xs text-muted-foreground">
            查看保存记录，对比历史版本，必要时回滚。
          </p>
        </div>
        <span className="rounded border border-border px-2 py-1 text-xs text-muted-foreground">
          {versions.length} 个版本
        </span>
      </div>

      {error && (
        <div className="border-b border-border bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-950/30">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-[360px_1fr]">
        <div className="divide-y divide-border border-b border-border lg:border-b-0 lg:border-r">
          {versions.length === 0 ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">暂无版本</div>
          ) : (
            versions.map((version) => {
              const canCompare =
                Boolean(currentVersionId) &&
                version.id !== currentVersionId &&
                version.hasTextContent;
              const isBusy = rollingBackId === version.id;

              return (
                <div key={version.id} className="space-y-3 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {version.message || `版本 ${shortId(version.id)}`}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatDate(version.createdAt)} · {version.size} bytes ·{" "}
                        {shortId(version.id)}
                      </div>
                    </div>
                    {version.isCurrent && (
                      <span className="shrink-0 rounded bg-accent px-2 py-1 text-xs text-primary">
                        当前版本
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => compareWithCurrent(version.id)}
                      disabled={!canCompare || loadingDiff}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                    >
                      {loadingDiff && selectedVersionId === version.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <GitCompareArrows size={13} />
                      )}
                      对比当前
                    </button>
                    <button
                      type="button"
                      onClick={() => rollback(version.id)}
                      disabled={version.isCurrent || !version.hasTextContent || Boolean(rollingBackId)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                    >
                      {isBusy ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <RotateCcw size={13} />
                      )}
                      回滚
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="min-h-[260px] bg-background">
          {selectedVersion ? (
            <div>
              <div className="border-b border-border px-4 py-3 text-sm">
                <span className="font-medium">对比当前：</span>
                <span className="text-muted-foreground">
                  {selectedVersion.message || shortId(selectedVersion.id)}
                </span>
              </div>
              <div className="max-h-[420px] overflow-auto p-4 font-mono text-xs leading-5">
                {diff.length === 0 ? (
                  <div className="text-muted-foreground">没有内容差异。</div>
                ) : (
                  diff.map((part, index) => (
                    <pre
                      key={`${index}-${part.added ? "add" : part.removed ? "remove" : "same"}`}
                      className={`whitespace-pre-wrap rounded-sm px-2 py-1 ${
                        part.added
                          ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
                          : part.removed
                            ? "bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-100"
                            : "text-muted-foreground"
                      }`}
                    >
                      {part.value}
                    </pre>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[260px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
              选择一个历史版本后，可以在这里查看与当前版本的差异。
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
