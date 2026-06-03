"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Loader2, X } from "lucide-react";
import ClientPortal from "./ClientPortal";

const priorities = ["P0", "P1", "P2", "P3"] as const;

type DocumentType = "md" | "html";
type Priority = (typeof priorities)[number];

export type DocumentFormDocument = {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
};

type DocumentCreateDialogProps = {
  projectId?: string;
  label?: string;
  className?: string;
  mode?: "create" | "edit";
  document?: DocumentFormDocument;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};

function starterContent(type: DocumentType, title: string) {
  if (type === "html") {
    return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body>
    <h1>${title}</h1>
  </body>
</html>
`;
  }

  return `# ${title}

## 背景

## 目标

## 范围

## 验收标准
`;
}

export default function DocumentCreateDialog({
  projectId,
  label = "新建文档",
  className,
  mode = "create",
  document,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: DocumentCreateDialogProps) {
  const router = useRouter();
  const isControlled = controlledOpen !== undefined;
  const [innerOpen, setInnerOpen] = useState(false);
  const open = isControlled ? controlledOpen : innerOpen;
  const isEdit = mode === "edit" && !!document;

  const [title, setTitle] = useState(document?.title ?? "");
  const [description, setDescription] = useState(document?.description ?? "");
  const [type, setType] = useState<DocumentType>("md");
  const [priority, setPriority] = useState<Priority>(document?.priority ?? "P2");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && isEdit && document) {
      setTitle(document.title);
      setDescription(document.description ?? "");
      setPriority(document.priority);
      setError("");
    }
  }, [open, isEdit, document]);

  function setOpen(next: boolean) {
    if (loading && !next) return;
    if (isControlled) {
      onOpenChange?.(next);
    } else {
      setInnerOpen(next);
    }
    if (!next) setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("请输入文档标题");
      return;
    }

    setLoading(true);
    setError("");
    try {
      let response: Response;
      if (isEdit) {
        response = await fetch(`/api/documents/${document!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: trimmedTitle,
            description: description.trim() ? description.trim() : null,
            priority,
          }),
        });
      } else {
        if (!projectId) {
          setError("缺少所属方案");
          return;
        }
        response = await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            title: trimmedTitle,
            description: description.trim() || undefined,
            type,
            priority,
            content: starterContent(type, trimmedTitle),
          }),
        });
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || (isEdit ? "保存失败" : "创建失败"));
        return;
      }

      if (!isEdit) {
        setTitle("");
        setDescription("");
        setType("md");
        setPriority("P2");
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  const dialogTitle = isEdit ? "编辑文档" : "新建文档";
  const submitLabel = isEdit ? "保存" : "创建";

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            className ||
            "inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          }
        >
          <FilePlus2 size={16} />
          {label}
        </button>
      )}

      {open && (
        <ClientPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="document-form-title"
              className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-elev-3"
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                <h2 id="document-form-title" className="text-base font-semibold">
                  {dialogTitle}
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-50"
                  aria-label="关闭"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 p-5">
                <div>
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="document-title">
                    文档标题
                  </label>
                  <input
                    id="document-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={128}
                    required
                    autoFocus
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                    placeholder="例如：登录注册 PRD"
                  />
                </div>

                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium"
                    htmlFor="document-description"
                  >
                    描述
                  </label>
                  <textarea
                    id="document-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                    placeholder="文档目标或评审范围"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {!isEdit && (
                    <div>
                      <div className="mb-2 text-sm font-medium">类型</div>
                      <div className="grid grid-cols-2 rounded-lg border border-border p-1">
                        {(["md", "html"] as const).map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => setType(item)}
                            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                              type === item
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-muted"
                            }`}
                          >
                            {item === "md" ? "Markdown" : "HTML"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className={isEdit ? "sm:col-span-2" : ""}>
                    <label
                      className="mb-2 block text-sm font-medium"
                      htmlFor="document-priority"
                    >
                      优先级
                    </label>
                    <select
                      id="document-priority"
                      value={priority}
                      onChange={(event) => setPriority(event.target.value as Priority)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                    >
                      {priorities.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {error && (
                  <div className="rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={loading}
                    className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {loading && <Loader2 size={14} className="animate-spin" />}
                    {submitLabel}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ClientPortal>
      )}
    </>
  );
}
