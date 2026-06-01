"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Rocket } from "lucide-react";
import MarkdownPreview, {
  type PreviewCommentAnchor,
} from "@/components/MarkdownPreview";
import type {
  CommentAnchor,
  ReviewComment,
} from "@/components/ReviewCommentsPanel";

type MarkdownEditorProps = {
  documentId: string;
  initialContent: string;
  commentAnchors?: PreviewCommentAnchor[];
  selectionComments?: ReviewComment[];
  onSelectCommentAnchor?: (anchor: CommentAnchor) => void;
};

export default function MarkdownEditor({
  documentId,
  initialContent,
  commentAnchors,
  selectionComments,
  onSelectCommentAnchor,
}: MarkdownEditorProps) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const dirty = content !== savedContent;

  async function saveVersion() {
    if (loading || !dirty) return;

    setLoading(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch(`/api/documents/${documentId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          message: "在线编辑发版",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "保存失败");
        return;
      }

      setSavedContent(content);
      setSaved(true);
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-medium">Markdown 编辑</h2>
          <p className="text-xs text-muted-foreground">
            左侧编辑草稿，右侧实时预览；点击发版后形成新的 PRD 版本。
          </p>
        </div>
        <button
          type="button"
          onClick={saveVersion}
          disabled={loading || !dirty}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : saved ? (
            <Check size={16} />
          ) : (
            <Rocket size={16} />
          )}
          发版
        </button>
      </div>

      {error && (
        <div className="border-b border-border bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-950/30">
          {error}
        </div>
      )}

      <div className="grid min-h-[560px] lg:grid-cols-2">
        <div className="border-b border-border lg:border-b-0 lg:border-r">
          <label className="sr-only" htmlFor="markdown-editor">
            Markdown 内容
          </label>
          <textarea
            id="markdown-editor"
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setSaved(false);
            }}
            spellCheck={false}
            className="h-full min-h-[560px] w-full resize-none bg-background p-4 font-mono text-sm leading-6 outline-none"
          />
        </div>

        <div className="min-h-[560px] overflow-auto bg-background p-4">
          <MarkdownPreview
            content={content}
            commentAnchors={commentAnchors}
            selectionComments={selectionComments}
            onSelectCommentAnchor={onSelectCommentAnchor}
          />
        </div>
      </div>
    </section>
  );
}
