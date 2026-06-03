"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createPrototypeElementAnchor,
  isPrototypeAnchorInContext,
  type PrototypePageContext,
  type PrototypeElementHit,
  type PrototypeRect,
} from "@/lib/prototype-annotations";
import type { CommentAnchor } from "@/components/ReviewCommentsPanel";
import {
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  Maximize2,
  MessageSquareText,
  MousePointer2,
  PanelRightClose,
  PencilLine,
  RefreshCw,
  Save,
  SendHorizontal,
  Undo2,
} from "lucide-react";

const PROTOTYPE_AGENT_SOURCE = "intentloop-prototype-agent";
const PROTOTYPE_HOST_SOURCE = "intentloop-prototype-host";
const PROTOTYPE_VIEWPORT = { width: 1366, height: 768 };

type PrototypeAgentMessage =
  | {
      source: typeof PROTOTYPE_AGENT_SOURCE;
      type: "ready" | "context";
      context: PrototypePageContext;
    }
  | {
      source: typeof PROTOTYPE_AGENT_SOURCE;
      type: "markers";
      context: PrototypePageContext;
      markers: PrototypeResolvedMarker[];
    }
  | {
      source: typeof PROTOTYPE_AGENT_SOURCE;
      type: "hover" | "select";
      target: PrototypeElementHit;
    }
  | {
      source: typeof PROTOTYPE_AGENT_SOURCE;
      type: "clear-hover";
    }
  | {
      source: typeof PROTOTYPE_AGENT_SOURCE;
      type: "text-edit-dirty";
      editCount: number;
    }
  | {
      source: typeof PROTOTYPE_AGENT_SOURCE;
      type: "serialized-html";
      requestId: string;
      html: string;
      editCount: number;
    };

type PrototypeResolvedMarker = {
  id: string;
  target: PrototypeElementHit;
};

function isPrototypeElementHit(value: unknown): value is PrototypeElementHit {
  if (!value || typeof value !== "object") return false;
  const hit = value as PrototypeElementHit;
  return (
    typeof hit.pagePath === "string" &&
    typeof hit.viewport?.w === "number" &&
    typeof hit.viewport?.h === "number" &&
    typeof hit.rect?.x === "number" &&
    typeof hit.rect?.y === "number" &&
    typeof hit.rect?.w === "number" &&
    typeof hit.rect?.h === "number" &&
    typeof hit.pageKey === "string" &&
    typeof hit.dom?.selector === "string" &&
    typeof hit.dom?.tagName === "string" &&
    typeof hit.dom?.fingerprint === "string"
  );
}

function isPrototypePageContext(value: unknown): value is PrototypePageContext {
  if (!value || typeof value !== "object") return false;
  const context = value as PrototypePageContext;
  return (
    typeof context.pagePath === "string" &&
    typeof context.pageKey === "string" &&
    typeof context.viewport?.w === "number" &&
    typeof context.viewport?.h === "number"
  );
}

function isPrototypeResolvedMarker(value: unknown): value is PrototypeResolvedMarker {
  if (!value || typeof value !== "object") return false;
  const marker = value as PrototypeResolvedMarker;
  return typeof marker.id === "string" && isPrototypeElementHit(marker.target);
}

export type PrototypeSandboxVersion = {
  id: string;
  message: string;
  size: number;
  createdAt: string;
  isCurrent: boolean;
  href: string;
};

export type PrototypeSandboxComment = {
  id: string;
  body: string;
  status: "open" | "handled" | "closed" | "resolved";
  anchorData: CommentAnchor;
  createdAt: string;
  author: {
    displayName: string;
    avatarColor: string;
  } | null;
};

type PrototypeSandboxProps = {
  documentId: string;
  title: string;
  mode?: "preview" | "review";
  selectedVersionId: string | null;
  selectedVersionSize: number | null;
  previewUrl: string;
  previewHtml: string;
  comments: PrototypeSandboxComment[];
  versions: PrototypeSandboxVersion[];
  defaultCommentPanelOpen?: boolean;
  canSaveHtmlVersion?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatSize(size: number) {
  if (size < 1024) return `${size} bytes`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function rectStyle(rect: PrototypeRect) {
  return {
    left: `${rect.x}%`,
    top: `${rect.y}%`,
    width: `${rect.w}%`,
    height: `${rect.h}%`,
  };
}

function markerStyle(rect: PrototypeRect) {
  return {
    left: `${clamp(rect.x + rect.w, 2, 98)}%`,
    top: `${clamp(rect.y, 2, 98)}%`,
  };
}

function safeDownloadName(value: string) {
  const normalized = value
    .trim()
    .replace(/[\\/:*?"<>|\r\n]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return normalized || "prototype";
}

export default function PrototypeSandbox({
  documentId,
  title,
  mode = "review",
  selectedVersionId,
  selectedVersionSize,
  previewUrl,
  previewHtml,
  comments,
  versions,
  defaultCommentPanelOpen = true,
  canSaveHtmlVersion = true,
}: PrototypeSandboxProps) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const frameWrapRef = useRef<HTMLDivElement | null>(null);
  const serializeRequestsRef = useRef(
    new Map<
      string,
      {
        resolve: (result: { html: string; editCount: number }) => void;
        reject: (error: Error) => void;
      }
    >()
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [annotating, setAnnotating] = useState(false);
  const [textEditEnabled, setTextEditEnabled] = useState(false);
  const [textEditDirtyCount, setTextEditDirtyCount] = useState(0);
  const [savingHtml, setSavingHtml] = useState(false);
  const [exportingHtml, setExportingHtml] = useState(false);
  const [reviewLayerVisible, setReviewLayerVisible] = useState(false);
  const [commentPanelOpen, setCommentPanelOpen] = useState(
    defaultCommentPanelOpen
  );
  const [currentContext, setCurrentContext] = useState<PrototypePageContext | null>(null);
  const [resolvedMarkers, setResolvedMarkers] = useState<PrototypeResolvedMarker[]>([]);
  const [hoverTarget, setHoverTarget] = useState<PrototypeElementHit | null>(null);
  const [draftTarget, setDraftTarget] = useState<PrototypeElementHit | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(
    comments[0]?.id ?? null
  );
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editError, setEditError] = useState("");
  const reviewEnabled = mode === "review";

  useEffect(() => {
    setAnnotating(false);
    setTextEditEnabled(false);
    setTextEditDirtyCount(0);
    setSavingHtml(false);
    setExportingHtml(false);
    setHoverTarget(null);
    setDraftTarget(null);
    setCurrentContext(null);
    setResolvedMarkers([]);
    setBody("");
    setError("");
    setEditError("");
    setReviewLayerVisible(false);
  }, [selectedVersionId, previewUrl, previewHtml]);

  useEffect(() => {
    if (!reviewEnabled) {
      setAnnotating(false);
      setTextEditEnabled(false);
      setTextEditDirtyCount(0);
      setReviewLayerVisible(false);
      setCommentPanelOpen(false);
      setHoverTarget(null);
      clearDraftAnnotation();
    }
  }, [reviewEnabled]);

  const postToFrame = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        source: PROTOTYPE_HOST_SOURCE,
        ...message,
      },
      "*"
    );
  }, []);

  const syncCommentsToFrame = useCallback(() => {
    postToFrame({
      type: "sync-comments",
      comments: comments.map((comment) => ({
        id: comment.id,
        anchor: comment.anchorData,
      })),
    });
  }, [comments, postToFrame]);

  const setFrameAnnotationEnabled = useCallback((enabled: boolean) => {
    postToFrame({
      type: "set-enabled",
      enabled,
    });
  }, [postToFrame]);

  const setFrameTextEditEnabled = useCallback((enabled: boolean) => {
    postToFrame({
      type: "set-text-edit-enabled",
      enabled,
    });
  }, [postToFrame]);

  useEffect(() => {
    function handlePrototypeMessage(event: MessageEvent<PrototypeAgentMessage>) {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (iframeWindow && event.source !== iframeWindow) return;
      const message = event.data;
      if (!message || message.source !== PROTOTYPE_AGENT_SOURCE) return;

      switch (message.type) {
        case "ready":
          if (isPrototypePageContext(message.context)) {
            setCurrentContext(message.context);
          }
          setFrameAnnotationEnabled(annotating);
          setFrameTextEditEnabled(textEditEnabled);
          syncCommentsToFrame();
          setHoverTarget(null);
          setResolvedMarkers([]);
          return;

        case "context":
          if (!isPrototypePageContext(message.context)) return;
          setCurrentContext(message.context);
          setHoverTarget(null);
          setDraftTarget((target) =>
            target && target.pageKey === message.context.pageKey ? target : null
          );
          syncCommentsToFrame();
          return;

        case "markers":
          if (!isPrototypePageContext(message.context)) return;
          setCurrentContext(message.context);
          setResolvedMarkers(
            Array.isArray(message.markers)
              ? message.markers.filter(isPrototypeResolvedMarker)
              : []
          );
          return;

        case "clear-hover":
          setHoverTarget(null);
          return;

        case "text-edit-dirty":
          setTextEditDirtyCount(Math.max(0, message.editCount || 0));
          return;

        case "serialized-html": {
          const pending = serializeRequestsRef.current.get(message.requestId);
          if (!pending) return;
          serializeRequestsRef.current.delete(message.requestId);
          pending.resolve({
            html: message.html,
            editCount: Math.max(0, message.editCount || 0),
          });
          return;
        }

        case "hover":
          if (!isPrototypeElementHit(message.target)) return;
          setHoverTarget(message.target);
          return;

        case "select":
          if (!reviewEnabled) return;
          if (!isPrototypeElementHit(message.target)) return;
          setDraftTarget(message.target);
          setHoverTarget(null);
          setReviewLayerVisible(true);
          setCommentPanelOpen(true);
          setActiveCommentId(null);
          setBody("");
          setError("");
      }
    }

    window.addEventListener("message", handlePrototypeMessage);
    return () => window.removeEventListener("message", handlePrototypeMessage);
  }, [
    annotating,
    reviewEnabled,
    setFrameAnnotationEnabled,
    setFrameTextEditEnabled,
    syncCommentsToFrame,
    textEditEnabled,
  ]);

  useEffect(() => {
    setFrameAnnotationEnabled(annotating);
    if (!annotating) {
      setHoverTarget(null);
    }
  }, [annotating, selectedVersionId, refreshKey, setFrameAnnotationEnabled]);

  useEffect(() => {
    setFrameTextEditEnabled(textEditEnabled);
    if (textEditEnabled) {
      setFrameAnnotationEnabled(false);
      setHoverTarget(null);
    }
  }, [
    refreshKey,
    selectedVersionId,
    setFrameAnnotationEnabled,
    setFrameTextEditEnabled,
    textEditEnabled,
  ]);

  useEffect(() => {
    syncCommentsToFrame();
  }, [syncCommentsToFrame, selectedVersionId, refreshKey]);

  function clearDraftAnnotation() {
    setHoverTarget(null);
    setDraftTarget(null);
    setBody("");
    setError("");
  }

  function refreshPreview() {
    setAnnotating(false);
    setTextEditEnabled(false);
    setTextEditDirtyCount(0);
    setEditError("");
    clearDraftAnnotation();
    setCurrentContext(null);
    setResolvedMarkers([]);
    setReviewLayerVisible(false);
    setCommentPanelOpen(defaultCommentPanelOpen);
    setRefreshKey((value) => value + 1);
  }

  function handleFrameLoad() {
    setHoverTarget(null);
    clearDraftAnnotation();
    setCurrentContext(null);
    setResolvedMarkers([]);
    setReviewLayerVisible(annotating);
    window.setTimeout(() => {
      setFrameAnnotationEnabled(annotating);
      setFrameTextEditEnabled(textEditEnabled);
      syncCommentsToFrame();
    }, 0);
  }

  async function enterFullscreen() {
    await iframeRef.current?.requestFullscreen();
  }

  function requestSerializedHtml() {
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return new Promise<{ html: string; editCount: number }>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        serializeRequestsRef.current.delete(requestId);
        reject(new Error("导出 HTML 超时，请刷新后重试"));
      }, 4000);
      serializeRequestsRef.current.set(requestId, {
        resolve: (result) => {
          window.clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          window.clearTimeout(timeout);
          reject(error);
        },
      });
      postToFrame({
        type: "serialize-html",
        requestId,
      });
    });
  }

  function downloadHtml(html: string) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeDownloadName(title)}-edited.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function exportEditedHtml() {
    if (exportingHtml || !selectedVersionId) return;
    if (!textEditDirtyCount && !textEditEnabled) {
      setEditError("当前没有可导出的修改");
      return;
    }

    setExportingHtml(true);
    setEditError("");
    try {
      const { html, editCount } = await requestSerializedHtml();
      setTextEditDirtyCount(editCount);
      if (!editCount) {
        setEditError("当前没有可导出的修改");
        return;
      }
      downloadHtml(html);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "导出失败");
    } finally {
      setExportingHtml(false);
    }
  }

  async function saveEditedHtmlVersion() {
    if (savingHtml || !selectedVersionId) return;
    if (!canSaveHtmlVersion) {
      setEditError("多文件 zip 原型暂不支持直接保存新版，请先导出 HTML");
      return;
    }
    if (!textEditDirtyCount && !textEditEnabled) {
      setEditError("当前没有可保存的修改");
      return;
    }

    setSavingHtml(true);
    setEditError("");
    try {
      const { html, editCount } = await requestSerializedHtml();
      setTextEditDirtyCount(editCount);
      if (!editCount) {
        setEditError("当前没有可保存的修改");
        return;
      }
      const response = await fetch(`/api/documents/${documentId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: html,
          message: `HTML 文案热修 ${new Date().toLocaleString("zh-CN")}`,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.versionId) {
        setEditError(data.error || "保存新版失败");
        return;
      }

      setTextEditEnabled(false);
      setTextEditDirtyCount(0);
      const params = new URLSearchParams(window.location.search);
      params.set("version", data.versionId);
      router.push(`/docs/${documentId}?${params.toString()}`);
      router.refresh();
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "保存新版失败");
    } finally {
      setSavingHtml(false);
    }
  }

  async function submitComment() {
    if (!selectedVersionId || !draftTarget || loading) return;
    const trimmed = body.trim();
    if (!trimmed) {
      setError("请输入评论内容");
      return;
    }
    const anchor = createPrototypeElementAnchor({
      versionId: selectedVersionId,
      pagePath: draftTarget.pagePath || previewUrl || "srcdoc",
      viewKey: draftTarget.viewKey,
      pageKey: draftTarget.pageKey,
      viewport: draftTarget.viewport,
      rect: draftTarget.rect,
      dom: draftTarget.dom,
    });

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/documents/${documentId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: selectedVersionId,
          anchor,
          body: trimmed,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "评论失败");
        return;
      }

      setBody("");
      setDraftTarget(null);
      setReviewLayerVisible(true);
      setCommentPanelOpen(true);
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  async function deleteComment(commentId: string) {
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

      if (activeCommentId === commentId) {
        setActiveCommentId(null);
      }
      if (comments.length <= 1 && !draftTarget) {
        setReviewLayerVisible(false);
      }
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setDeletingId(null);
    }
  }

  const visibleMarkers = resolvedMarkers
    .flatMap((marker) => {
      const comment = comments.find((item) => item.id === marker.id);
      return comment ? [{ marker, comment }] : [];
    })
    .filter((item) => isPrototypeAnchorInContext(item.comment.anchorData, currentContext));
  const activeComment =
    comments.find((comment) => comment.id === activeCommentId) ?? comments[0];
  const draftRect = draftTarget?.rect ?? null;
  const hoverRect = annotating && !draftTarget ? hoverTarget?.rect ?? null : null;

  return (
    <section
      data-prototype-sandbox-mode={mode}
      className="overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="shrink-0 text-sm font-semibold">
            {reviewEnabled ? "原型评审" : "原型预览"}
          </h2>
          <span className="truncate text-xs text-muted-foreground">{title}</span>
          {selectedVersionSize !== null && (
            <span className="hidden rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground md:inline-flex">
              {formatSize(selectedVersionSize)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <select
            id="prototype-version-select"
            aria-label="版本切换"
            value={selectedVersionId ?? ""}
            onChange={(event) => {
              const next = versions.find(
                (version) => version.id === event.target.value
              );
              if (next) {
                setAnnotating(false);
                clearDraftAnnotation();
                setReviewLayerVisible(false);
                router.push(next.href);
              }
            }}
            disabled={versions.length === 0}
            className="h-8 max-w-[300px] rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          >
            {versions.length === 0 ? (
              <option value="">暂无版本</option>
            ) : (
              versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.message || "未填写更新说明"}
                  {version.isCurrent ? "（当前）" : ""}
                </option>
              ))
            )}
          </select>

          {reviewEnabled && (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditError("");
                  setTextEditEnabled((value) => {
                    const next = !value;
                    if (next) {
                      setAnnotating(false);
                      setHoverTarget(null);
                      setReviewLayerVisible(false);
                    }
                    return next;
                  });
                }}
                disabled={!selectedVersionId}
                aria-pressed={textEditEnabled}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium disabled:opacity-50 ${
                  textEditEnabled
                    ? "border-primary bg-accent text-primary"
                    : "border-border hover:bg-muted"
                }`}
                title="编辑原型文案"
              >
                <PencilLine size={14} />
                {textEditEnabled ? "编辑中" : "编辑"}
              </button>

              {(textEditEnabled || textEditDirtyCount > 0) && (
                <>
                  {textEditDirtyCount > 0 && (
                    <span className="inline-flex h-8 items-center rounded-md border border-border bg-muted px-2 text-xs text-muted-foreground">
                      {textEditDirtyCount} 处修改
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={saveEditedHtmlVersion}
                    disabled={
                      !selectedVersionId ||
                      (!textEditDirtyCount && !textEditEnabled) ||
                      savingHtml ||
                      !canSaveHtmlVersion
                    }
                    aria-label="保存新版"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    title={
                      canSaveHtmlVersion
                        ? "保存为新的 HTML 版本"
                        : "多文件 zip 原型暂不支持直接保存新版"
                    }
                  >
                    {savingHtml ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  </button>

                  <button
                    type="button"
                    onClick={exportEditedHtml}
                    disabled={
                      !selectedVersionId ||
                      (!textEditDirtyCount && !textEditEnabled) ||
                      exportingHtml
                    }
                    aria-label="导出 HTML"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    title="导出当前编辑后的 HTML"
                  >
                    {exportingHtml ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Download size={14} />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={refreshPreview}
                    disabled={!selectedVersionId || (!textEditDirtyCount && !textEditEnabled)}
                    aria-label="放弃修改"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    title="放弃本次文本修改"
                  >
                    <Undo2 size={14} />
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  setError("");
                  setAnnotating((value) => {
                    const next = !value;
                    if (next) {
                      setTextEditEnabled(false);
                      setReviewLayerVisible(true);
                    } else {
                      setHoverTarget(null);
                    }
                    return next;
                  });
                }}
                disabled={!selectedVersionId}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium disabled:opacity-50 ${
                  annotating
                    ? "border-primary bg-accent text-primary"
                    : "border-border hover:bg-muted"
                }`}
                title="元素标注"
              >
                <MousePointer2 size={14} />
                {annotating ? "标注中" : "标注"}
              </button>

              <button
                type="button"
                onClick={() => setReviewLayerVisible((value) => !value)}
                disabled={!selectedVersionId || (comments.length === 0 && !draftTarget)}
                aria-label={reviewLayerVisible ? "隐藏标注" : "显示标注"}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-50 ${
                  reviewLayerVisible
                    ? "border-border bg-muted text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                title={reviewLayerVisible ? "隐藏标注" : "显示标注"}
              >
                {reviewLayerVisible ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={refreshPreview}
            disabled={!selectedVersionId}
            aria-label="刷新预览"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            title="刷新"
          >
            <RefreshCw size={14} />
          </button>

          {previewUrl ? (
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-muted"
              title="新窗口打开"
            >
              <ExternalLink size={14} />
              打开
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium opacity-50"
              title="新窗口打开"
            >
              <ExternalLink size={14} />
              打开
            </button>
          )}

          <button
            type="button"
            onClick={enterFullscreen}
            disabled={!selectedVersionId}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            title="全屏"
          >
            <Maximize2 size={14} />
            全屏
          </button>
        </div>
      </div>

      {editError && (
        <div className="border-b border-border bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-950/30">
          {editError}
        </div>
      )}

      <div
        data-prototype-comment-panel={
          reviewEnabled ? (commentPanelOpen ? "open" : "collapsed") : "hidden"
        }
        data-prototype-viewport={`${PROTOTYPE_VIEWPORT.width}x${PROTOTYPE_VIEWPORT.height}`}
        className={`grid min-h-[760px] ${
          reviewEnabled
            ? commentPanelOpen
              ? "xl:grid-cols-[minmax(0,1fr)_320px]"
              : "xl:grid-cols-[minmax(0,1fr)_56px]"
            : "grid-cols-1"
        }`}
      >
        <div className="min-w-0 bg-slate-100 p-4">
          <div className="overflow-auto">
            <div
              ref={frameWrapRef}
              className="relative bg-white shadow-sm ring-1 ring-border"
              style={{
                width: PROTOTYPE_VIEWPORT.width,
                height: PROTOTYPE_VIEWPORT.height,
              }}
            >
              <iframe
                key={`${selectedVersionId ?? "empty"}-${refreshKey}`}
                ref={iframeRef}
                title="原型沙盘预览"
                sandbox="allow-scripts allow-forms allow-modals allow-popups"
                allowFullScreen
                onLoad={handleFrameLoad}
                src={previewUrl || undefined}
                srcDoc={previewUrl ? undefined : previewHtml || "暂无原型内容"}
                className="h-full w-full bg-white"
              />

          {reviewEnabled && reviewLayerVisible && visibleMarkers.map(({ marker, comment }, index) => {
            const rect = marker.target.rect;
            return (
              <button
                key={comment.id}
                type="button"
                data-prototype-comment-marker="true"
                onClick={() => setActiveCommentId(comment.id)}
                className={`absolute z-20 flex h-6 min-w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border px-1 text-xs font-semibold shadow-sm ${
                  activeCommentId === comment.id
                    ? "border-primary bg-primary text-primary-foreground ring-2 ring-primary/20"
                    : "border-primary/50 bg-primary text-primary-foreground"
                }`}
                style={markerStyle(rect)}
                title={comment.body}
              >
                {index + 1}
              </button>
            );
          })}

          {reviewEnabled && hoverRect && (
            <div
              data-prototype-element-hover="true"
              className="pointer-events-none absolute z-10 rounded border-2 border-primary/80 bg-primary/5"
              style={rectStyle(hoverRect)}
            >
              <div className="absolute left-0 top-0 max-w-[280px] -translate-y-[calc(100%+6px)] rounded-md border border-border bg-background/95 px-2 py-1 text-xs text-foreground shadow-lg">
                <span className="font-medium">{hoverTarget?.dom.tagName}</span>
                <span className="ml-2 text-muted-foreground">
                  {Math.round(hoverRect.w)}% x {Math.round(hoverRect.h)}%
                </span>
              </div>
            </div>
          )}

          {reviewEnabled && reviewLayerVisible && draftRect && (
            <div
              data-prototype-comment-draft="true"
              className="pointer-events-none absolute z-10 rounded border-2 border-primary bg-primary/10"
              style={rectStyle(draftRect)}
            />
          )}
            </div>
          </div>
        </div>

        {reviewEnabled && (
        <aside className="flex min-h-0 flex-col border-t border-border bg-muted/20 xl:border-l xl:border-t-0">
          {!commentPanelOpen ? (
            <div className="flex h-full items-start justify-center bg-card p-2">
              <button
                type="button"
                onClick={() => setCommentPanelOpen(true)}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="展开原型评论"
                title="展开原型评论"
              >
                <MessageSquareText size={18} />
                {comments.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                    {comments.length}
                  </span>
                )}
              </button>
            </div>
          ) : (
            <>
          <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
            <h3 className="text-sm font-semibold">评论 {comments.length}</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setReviewLayerVisible((value) => !value)}
                disabled={!selectedVersionId || (comments.length === 0 && !draftTarget)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                {reviewLayerVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                {reviewLayerVisible ? "隐藏" : "显示"}
              </button>
              <span className="rounded border border-border px-2 py-1 text-xs text-muted-foreground">
                {annotating ? "标注中" : "浏览"}
              </span>
              <button
                type="button"
                onClick={() => setCommentPanelOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="收起原型评论"
                title="收起原型评论"
              >
                <PanelRightClose size={15} />
              </button>
            </div>
          </div>

          <div className="border-b border-border bg-card p-4">
            {draftTarget && draftRect ? (
              <div className="space-y-3">
                <div className="border-l-2 border-muted-foreground/30 pl-3 text-sm text-muted-foreground">
                  {draftTarget.dom.tagName} ·{" "}
                  {draftTarget.dom.text || draftTarget.dom.selector}
                </div>
                <label className="sr-only" htmlFor="prototype-comment-body">
                  评论内容
                </label>
                <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 focus-within:border-primary/60 focus-within:bg-background">
                  <textarea
                    id="prototype-comment-body"
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    rows={2}
                    placeholder="评论这个元素"
                    className="w-full resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-muted-foreground/70"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDraftTarget(null);
                        setBody("");
                        setError("");
                        if (comments.length === 0) {
                          setReviewLayerVisible(false);
                        }
                      }}
                      disabled={loading}
                      className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={submitComment}
                      disabled={loading || !selectedVersionId || !body.trim()}
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
                开启标注后，点击元素添加评论。
              </div>
            )}

            {error && (
              <div className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-600 dark:bg-red-950/30">
                {error}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {comments.length === 0 ? (
              <div className="rounded-lg border border-border/70 bg-background px-4 py-10 text-center text-sm text-muted-foreground">
                暂无原型标注。
              </div>
            ) : (
              comments.map((comment, index) => (
                <article
                  key={comment.id}
                  id={`prototype-comment-${comment.id}`}
                  onClick={() => {
                    setActiveCommentId(comment.id);
                    setReviewLayerVisible(true);
                  }}
                  className={`overflow-hidden rounded-md border bg-background shadow-sm ${
                    activeComment?.id === comment.id
                      ? "border-primary ring-2 ring-primary/15"
                      : "border-border hover:border-primary/50"
                  } cursor-pointer transition`}
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
                        onClick={() => deleteComment(comment.id)}
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
            </>
          )}
        </aside>
        )}
      </div>
    </section>
  );
}
