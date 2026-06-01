import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { FileCode2, FileText, FolderKanban } from "lucide-react";
import { db, schema } from "@/lib/db";
import DocumentCreateDialog from "@/components/DocumentCreateDialog";
import DocumentImportDialog from "@/components/DocumentImportDialog";

const statusLabels: Record<string, string> = {
  draft: "草稿",
  reviewing: "评审中",
  published: "已发布",
  archived: "已归档",
};

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  const currentProject = project
    ? db.select().from(schema.projects).where(eq(schema.projects.id, project)).get()
    : null;
  const documents = db
    .select()
    .from(schema.documents)
    .where(project ? eq(schema.documents.projectId, project) : undefined)
    .orderBy(desc(schema.documents.updatedAt))
    .all();

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {currentProject ? currentProject.name : "全部文档"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {currentProject
              ? "在这个项目下创建、筛选和评审 PRD 与 HTML 原型。"
              : "Markdown PRD 和 HTML 原型会集中展示在这里。"}
          </p>
        </div>
        {currentProject ? (
          <div className="flex items-center gap-2">
            <DocumentImportDialog projectId={currentProject.id} />
            <DocumentCreateDialog projectId={currentProject.id} />
          </div>
        ) : (
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <FolderKanban size={16} />
            选择项目
          </Link>
        )}
      </header>

      {documents.length === 0 ? (
        <section className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-muted">
            <FileText size={22} />
          </div>
          <h2 className="text-lg font-medium">
            {currentProject ? "这个项目还没有文档" : "还没有文档"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {currentProject
              ? "创建第一篇 Markdown PRD 或 HTML 原型后，就可以在项目下继续编辑和评审。"
              : "先从项目页进入具体项目，再创建项目内的第一篇文档。"}
          </p>
          <div className="mt-5">
            {currentProject ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <DocumentImportDialog
                  projectId={currentProject.id}
                  label="导入已有文件"
                  className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                />
                <DocumentCreateDialog
                  projectId={currentProject.id}
                  label="创建第一篇文档"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                />
              </div>
            ) : (
              <Link
                href="/projects"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <FolderKanban size={16} />
                去项目页
              </Link>
            )}
          </div>
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          {documents.map((document) => {
            const Icon = document.type === "md" ? FileText : FileCode2;
            return (
              <Link
                key={document.id}
                href={`/docs/${document.id}`}
                className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/60"
              >
                <Icon size={18} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {document.title}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {document.type.toUpperCase()} · {statusLabels[document.status]}
                  </div>
                </div>
                <span className="rounded border border-border px-2 py-1 text-xs text-muted-foreground">
                  {document.priority}
                </span>
              </Link>
            );
          })}
        </section>
      )}
    </div>
  );
}
