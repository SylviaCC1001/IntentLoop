"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, PanelRightClose, SendHorizontal } from "lucide-react";

export type CommentAnchor =
  | { type: "doc" }
  | { type: "block"; blockId: string; textHash: string; preview: string }
  | {
      type: "element";
      selector: string;
      textHash: string;
      preview: string;
      kind?: "selection" | "prototype-rect" | "prototype-element";
      blockId?: string;
      selectedText?: string;
      startOffset?: number;
      endOffset?: number;
      pagePath?: string;
      viewKey?: string;
      pageKey?: string;
      viewport?: { w: number; h: number };
      bbox?: { x: number; y: number; w: number; h: number };
      domAnchor?: {
        selector: string;
        xpath?: string;
        tagName: string;
        id?: string;
        className?: string;
        role?: string;
        text?: string;
        fingerprint: string;
      };
    };

export type ReviewComment = {
  id: string;
  body: string;
  status: "open" | "handled" | "closed" | "resolved";
  anchorType: "doc" | "block" | "element";
  anchorData: CommentAnchor;
  createdAt: string;
  author: {
    displayName: string;
    avatarColor: string;
  } | null;
};

type ReviewCommentsPanelProps = {
  documentId: string;
  versionId: string | null;
  comments: ReviewComment[];
  selectedAnchor: CommentAnchor | null;
  activeCommentId?: string | null;
  onCollapse: () => void;
  className?: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function anchorLabel(anchor: CommentAnchor) {
  if (anchor.type === "doc") {
    return "";
  }

  return anchor.preview;
}

export default function ReviewCommentsPanel({
  documentId,
  versionId,
  comments,
  selectedAnchor,
  activeCommentId,
  onCollapse,
  className = "",
}: ReviewCommentsPanelProps) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const openCount = comments.filter((comment) => comment.status === "open").length;

  async function submitComment() {
    if (!versionId || loading) return;
    const trimmed = body.trim();
    if (!trimmed) {
      setError("请输入评论内容");
      return;
    }

    if (!selectedAnchor) {
      setError("请先在左侧正文中选中文字");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/documents/${documentId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId,
          anchor: selectedAnchor,
          body: trimmed,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "评论失败");
        return;
      }

      setBody("");
      setError("");
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  async function deleteResolvedComment(commentId: string) {
    if (deletingId) return;

    setDeletingId(commentId);
    setError("");
    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "删除评论失败");
        return;
      }

      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section
      className={`flex min-h-0 flex-col border border-border bg-card shadow-sm ${className}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="truncate text-base font-medium">评论（{openCount}）</h2>
        <button
          type="button"
          onClick={onCollapse}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="收起注释"
          title="收起注释"
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      <div className="shrink-0 border-b border-border/70 p-4">
        {selectedAnchor ? (
          <div className="rounded-lg border border-border/70 bg-background p-3 shadow-sm">
            <div className="mb-3 border-l-2 border-muted-foreground/30 pl-3 text-sm text-muted-foreground">
              {anchorLabel(selectedAnchor)}
            </div>
            <label className="sr-only" htmlFor="comment-body">
              添加注释
            </label>
            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 focus-within:border-primary/60 focus-within:bg-background">
              <textarea
                id="comment-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={2}
                placeholder="添加注释"
                className="w-full resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-muted-foreground/70"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBody("");
                    setError("");
                  }}
                  disabled={loading}
                  className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={submitComment}
                  disabled={loading || !versionId || !body.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
                >
                  {loading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <SendHorizontal size={13} />
                  )}
                  发送
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
            选中文档内容后添加注释。
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-600 dark:bg-red-950/30">
            {error}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 p-3">
        {comments.length === 0 ? (
          <div className="rounded-lg border border-border/70 bg-background px-4 py-10 text-center text-sm text-muted-foreground">
            暂无待处理注释。
          </div>
        ) : (
          comments.map((comment, index) => (
            <article
              key={comment.id}
              id={`review-comment-${comment.id}`}
              data-review-comment-id={comment.id}
              className={`overflow-hidden rounded-md border bg-background shadow-sm ${
                activeCommentId === comment.id
                  ? "border-primary ring-2 ring-primary/15"
                  : "border-border"
              }`}
            >
              <div className="h-1 bg-amber-400" />
              <div className="space-y-2.5 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1 text-[11px] font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="truncate text-sm font-medium">
                      {comment.author?.displayName || "未知用户"}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(comment.createdAt)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteResolvedComment(comment.id)}
                    disabled={Boolean(deletingId)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    aria-label="解决"
                    title="解决"
                  >
                    {deletingId === comment.id ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={16} />
                    )}
                  </button>
                </div>

                <div className="flex items-start gap-2">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
                    style={{
                      backgroundColor: comment.author?.avatarColor || "#64748b",
                    }}
                  >
                    {(comment.author?.displayName || "?").slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap text-sm leading-6">
                      {comment.body}
                    </p>
                  </div>
                </div>

              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
