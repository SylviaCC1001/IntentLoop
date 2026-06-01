"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, X } from "lucide-react";

type AssetType = "prd" | "prototype" | "appendix";

type SolutionAssetUploadDialogProps = {
  solutionId: string;
  assetType: AssetType;
  label: string;
  title: string;
  accept: string;
  helpText: string;
  defaultTitle?: string;
  className?: string;
};

function inferTitle(file: File | null) {
  if (!file) return "";
  return file.name.replace(/\.[^.]+$/, "");
}

export default function SolutionAssetUploadDialog({
  solutionId,
  assetType,
  label,
  title,
  accept,
  helpText,
  defaultTitle = "",
  className,
}: SolutionAssetUploadDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [assetTitle, setAssetTitle] = useState(defaultTitle);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function close() {
    if (!loading) {
      setOpen(false);
      setError("");
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    if (selected && !assetTitle.trim()) {
      setAssetTitle(inferTitle(selected));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("请选择要上传的文件");
      return;
    }

    const formData = new FormData();
    formData.set("assetType", assetType);
    formData.set("file", file);
    formData.set("title", assetTitle.trim() || defaultTitle || inferTitle(file));
    if (message.trim()) {
      formData.set("message", message.trim());
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/solutions/${solutionId}/assets`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "上传失败");
        return;
      }

      setFile(null);
      setAssetTitle(defaultTitle);
      setMessage("");
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
          "inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
        }
      >
        <FileUp size={16} />
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="solution-asset-upload-title"
            className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 id="solution-asset-upload-title" className="text-base font-semibold">
                {title}
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
                <label className="mb-1 block text-sm font-medium" htmlFor={`asset-file-${assetType}`}>
                  文件
                </label>
                <input
                  id={`asset-file-${assetType}`}
                  type="file"
                  accept={accept}
                  onChange={handleFileChange}
                  required
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">{helpText}</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor={`asset-title-${assetType}`}>
                  名称
                </label>
                <input
                  id={`asset-title-${assetType}`}
                  value={assetTitle}
                  onChange={(event) => setAssetTitle(event.target.value)}
                  maxLength={128}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                  placeholder="默认使用文件名"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor={`asset-message-${assetType}`}>
                  更新说明
                </label>
                <textarea
                  id={`asset-message-${assetType}`}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                  placeholder={
                    assetType === "appendix"
                      ? "附件用途或来源"
                      : "本次上传调整了什么"
                  }
                />
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
                  上传
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
