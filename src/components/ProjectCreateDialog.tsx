"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Loader2, X } from "lucide-react";
import ClientPortal from "./ClientPortal";

const colors = [
  "#6366f1",
  "#0f766e",
  "#dc2626",
  "#ca8a04",
  "#7c3aed",
  "#2563eb",
];

export type ProjectFormProject = {
  id: string;
  name: string;
  description: string | null;
  color: string;
};

type ProjectCreateDialogProps = {
  label?: string;
  className?: string;
  mode?: "create" | "edit";
  project?: ProjectFormProject;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};

export default function ProjectCreateDialog({
  label = "新建需求方案",
  className,
  mode = "create",
  project,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: ProjectCreateDialogProps) {
  const router = useRouter();
  const isControlled = controlledOpen !== undefined;
  const [innerOpen, setInnerOpen] = useState(false);
  const open = isControlled ? controlledOpen : innerOpen;
  const isEdit = mode === "edit" && !!project;

  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [color, setColor] = useState(project?.color ?? colors[0]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && isEdit && project) {
      setName(project.name);
      setDescription(project.description ?? "");
      setColor(project.color);
      setError("");
    }
  }, [open, isEdit, project]);

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
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("请输入需求方案名称");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const url = isEdit ? `/api/projects/${project!.id}` : "/api/projects";
      const method = isEdit ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim() ? description.trim() : isEdit ? null : undefined,
          color,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || (isEdit ? "保存失败" : "创建失败"));
        return;
      }

      if (!isEdit) {
        setName("");
        setDescription("");
        setColor(colors[0]);
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  const title = isEdit ? "编辑需求方案" : "新建需求方案";
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
          <FolderPlus size={16} />
          {label}
        </button>
      )}

      {open && (
        <ClientPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="project-form-title"
              className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-elev-3"
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                <h2 id="project-form-title" className="text-base font-semibold">
                  {title}
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
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="project-name">
                    需求方案名称
                  </label>
                  <input
                    id="project-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={64}
                    required
                    autoFocus
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                    placeholder="例如：AI 工作台改版"
                  />
                </div>

                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium"
                    htmlFor="project-description"
                  >
                    描述
                  </label>
                  <textarea
                    id="project-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
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
                        className={`h-8 w-8 rounded-full border-2 transition-transform ${
                          color === item ? "border-foreground scale-110" : "border-transparent"
                        }`}
                        style={{ background: item }}
                        aria-label={`选择颜色 ${item}`}
                      />
                    ))}
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
