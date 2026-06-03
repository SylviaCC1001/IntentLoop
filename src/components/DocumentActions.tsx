"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Pencil, Trash2 } from "lucide-react";
import ActionsMenu from "./ActionsMenu";
import DocumentCreateDialog, { DocumentFormDocument } from "./DocumentCreateDialog";

type DocumentActionsProps = {
  document: DocumentFormDocument;
  onDeleted?: () => void;
  className?: string;
  exportHref?: string;
  exportLabel?: string;
};

export default function DocumentActions({
  document,
  onDeleted,
  className,
  exportHref,
  exportLabel = "导出",
}: DocumentActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);

  async function handleDelete() {
    const response = await fetch(`/api/documents/${document.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(data.error || "删除失败");
      return;
    }
    onDeleted?.();
    router.refresh();
  }

  return (
    <>
      <ActionsMenu
        ariaLabel={`${document.title} 操作菜单`}
        className={className}
        items={[
          ...(exportHref
            ? [
                {
                  key: "export",
                  label: exportLabel,
                  icon: <Download size={14} />,
                  href: exportHref,
                  download: true,
                },
              ]
            : []),
          {
            key: "rename",
            label: "编辑",
            icon: <Pencil size={14} />,
            onSelect: () => setEditOpen(true),
          },
          {
            key: "delete",
            label: "删除",
            icon: <Trash2 size={14} />,
            danger: true,
            confirmTitle: `删除 ${document.title}？`,
            confirmDescription:
              "删除后,该文档的所有版本、评论和原型文件都会一并删除,无法恢复。",
            onSelect: handleDelete,
          },
        ]}
      />
      <DocumentCreateDialog
        mode="edit"
        document={document}
        open={editOpen}
        onOpenChange={setEditOpen}
        hideTrigger
      />
    </>
  );
}
