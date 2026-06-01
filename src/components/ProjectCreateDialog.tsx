"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Loader2, X } from "lucide-react";

const colors = [
  "#6366f1",
  "#0f766e",
  "#dc2626",
  "#ca8a04",
  "#7c3aed",
  "#2563eb",
];

type ProjectCreateDialogProps = {
  label?: string;
  className?: string;
};

export default function ProjectCreateDialog({
  label = "新建需求方案",
  className,
}: ProjectCreateDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(colors[0]);
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
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("请输入需求方案名称");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim() || undefined,
          color,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "创建失败");
        return;
      }

      setName("");
      setDescription("");
      setColor(colors[0]);
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
        <FolderPlus size={16} />
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-create-title"
            className="w-full max-w-md rounded-lg border border-border bg-card shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 id="project-create-title" className="text-base font-semibold">
                新建需求方案
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
                <label className="mb-1 block text-sm font-medium" htmlFor="project-name">
                  需求方案名称
                </label>
                <input
                  id="project-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={64}
                  required
                  autoFocus
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                  placeholder="例如：AI 工作台改版"
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="project-description"
                >
                  描述
                </label>
                <textarea
                  id="project-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                  placeholder="需求背景、目标或范围"
                />
              </div>

              <div>
                <div className="mb-2 text-sm font-medium">颜色</div>
                <div className="flex gap-2">
                  {colors.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setColor(item)}
                      className={`h-8 w-8 rounded-full border-2 ${
                        color === item ? "border-foreground" : "border-transparent"
                      }`}
                      style={{ background: item }}
                      aria-label={`选择颜色 ${item}`}
                    />
                  ))}
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
