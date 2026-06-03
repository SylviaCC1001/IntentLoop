"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import ActionsMenu from "./ActionsMenu";
import ProjectCreateDialog, { ProjectFormProject } from "./ProjectCreateDialog";

type ProjectActionsProps = {
  project: ProjectFormProject;
};

export default function ProjectActions({ project }: ProjectActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);

  async function handleDelete() {
    const response = await fetch(`/api/projects/${project.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(data.error || "删除失败");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <div onClick={(event) => event.preventDefault()}>
        <ActionsMenu
          ariaLabel={`${project.name} 操作菜单`}
          items={[
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
              confirmTitle: `删除 ${project.name}？`,
              confirmDescription:
                "删除后,该方案下所有 PRD、原型、附录、版本和评论都会一并删除,无法恢复。",
              onSelect: handleDelete,
            },
          ]}
        />
      </div>
      <ProjectCreateDialog
        mode="edit"
        project={project}
        open={editOpen}
        onOpenChange={setEditOpen}
        hideTrigger
      />
    </>
  );
}
