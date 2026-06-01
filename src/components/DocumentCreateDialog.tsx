"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Loader2, X } from "lucide-react";

const priorities = ["P0", "P1", "P2", "P3"] as const;

type DocumentType = "md" | "html";
type Priority = (typeof priorities)[number];

type DocumentCreateDialogProps = {
  projectId: string;
  label?: string;
  className?: string;
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
}: DocumentCreateDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<DocumentType>("md");
  const [priority, setPriority] = useState<Priority>("P2");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function close() {
    if (!loading) {
      setOpen(false);
      setError("");
    }
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
      const response = await fetch("/api/documents", {
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
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "创建失败");
        return;
      }

      setTitle("");
      setDescription("");
      setType("md");
      setPriority("P2");
      setOpen(false);
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          "inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        }
      >
        <FilePlus2 size={16} />
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="document-create-title"
            className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 id="document-create-title" className="text-base font-semibold">
                新建文档
              </h2>
              <button
                type="button"
                onClick={close}
                disabled={loading}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted disabled:opacity-50"
                aria-label="关闭"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-4">
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="document-title">
                  文档标题
                </label>
                <input
                  id="document-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={128}
                  required
                  autoFocus
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                  placeholder="例如：登录注册 PRD"
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="document-description"
                >
                  描述
                </label>
                <textarea
                  id="document-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                  placeholder="文档目标或评审范围"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-2 text-sm font-medium">类型</div>
                  <div className="grid grid-cols-2 rounded-md border border-border p-1">
                    {(["md", "html"] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setType(item)}
                        className={`rounded px-3 py-1.5 text-sm ${
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

                <div>
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
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
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
                <div className="rounded-md bg-red-50 p-2 text-sm text-red-600 dark:bg-red-950/30">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={loading}
                  className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
