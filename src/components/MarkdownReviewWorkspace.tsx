"use client";

import { useMemo, useState } from "react";
import { MessageSquareText } from "lucide-react";
import MarkdownPreview, {
  type PreviewCommentAnchor,
} from "@/components/MarkdownPreview";
import ReviewCommentsPanel, {
  type CommentAnchor,
  type ReviewComment,
} from "@/components/ReviewCommentsPanel";

type MarkdownReviewWorkspaceProps = {
  documentId: string;
  content: string;
  versionId: string | null;
  comments: ReviewComment[];
  lineAnchors: PreviewCommentAnchor[];
  canComment: boolean;
};

export default function MarkdownReviewWorkspace({
  documentId,
  content,
  versionId,
  comments,
  lineAnchors,
  canComment,
}: MarkdownReviewWorkspaceProps) {
  const [selectedAnchor, setSelectedAnchor] =
    useState<CommentAnchor | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  const openSelectionComments = useMemo(
    () =>
      comments.filter(
        (comment) =>
          comment.anchorData.type === "element" &&
          comment.anchorData.kind === "selection" &&
          comment.status === "open"
      ),
    [comments]
  );

  function selectAnchor(anchor: CommentAnchor, commentId?: string) {
    if (!canComment) return;
    setPanelOpen(true);
    if (commentId) {
      setActiveCommentId(commentId);
      setSelectedAnchor(null);
      window.setTimeout(() => {
        document.getElementById(`review-comment-${commentId}`)?.scrollIntoView({
          block: "nearest",
        });
      }, 0);
      return;
    }

    setActiveCommentId(null);
    setSelectedAnchor(anchor);
    window.setTimeout(() => document.getElementById("comment-body")?.focus(), 0);
  }

  if (!canComment) {
    return (
      <section
        data-markdown-readonly-preview="true"
        className="min-w-0 rounded-lg border border-border bg-card"
      >
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">文档预览</h2>
          <p className="text-xs text-muted-foreground">只读渲染视图</p>
        </div>
        <article className="mx-auto min-h-[680px] max-w-4xl bg-background px-8 py-8 md:px-12">
          <MarkdownPreview content={content} />
        </article>
      </section>
    );
  }

  return (
    <div
      className={`grid items-start gap-6 ${
        panelOpen ? "xl:grid-cols-[minmax(0,1fr)_400px]" : "xl:grid-cols-[minmax(0,1fr)_64px]"
      }`}
    >
      <section className="min-w-0 rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-medium">评审预览</h2>
            <p className="text-xs text-muted-foreground">
              只读渲染视图；选中文字后添加注释。
            </p>
          </div>
          <span className="rounded border border-border px-2 py-1 text-xs text-muted-foreground">
            {openSelectionComments.length} 条待处理
          </span>
        </div>

        <article className="mx-auto min-h-[680px] max-w-4xl bg-background px-8 py-8 md:px-12">
          <MarkdownPreview
            content={content}
            commentAnchors={lineAnchors}
            selectionComments={openSelectionComments}
            onSelectCommentAnchor={selectAnchor}
          />
        </article>
      </section>

      <aside className="sticky top-6 max-h-[calc(100vh-3rem)] min-h-[560px]">
        {panelOpen ? (
          <ReviewCommentsPanel
            documentId={documentId}
            versionId={versionId}
            comments={openSelectionComments}
            selectedAnchor={selectedAnchor}
            activeCommentId={activeCommentId}
            onCollapse={() => setPanelOpen(false)}
            className="h-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm hover:text-foreground"
            aria-label="展开注释"
            title="展开注释"
          >
            <span className="relative">
              <MessageSquareText size={20} />
              {openSelectionComments.length > 0 && (
                <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                  {openSelectionComments.length}
                </span>
              )}
            </span>
          </button>
        )}
      </aside>
    </div>
  );
}
