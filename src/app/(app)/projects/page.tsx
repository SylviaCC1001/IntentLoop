import Link from "next/link";
import { desc } from "drizzle-orm";
import { FileText, FolderPlus } from "lucide-react";
import { db, schema } from "@/lib/db";
import ProjectCreateDialog from "@/components/ProjectCreateDialog";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function ProjectsPage() {
  const projects = db
    .select()
    .from(schema.projects)
    .orderBy(desc(schema.projects.updatedAt))
    .all();

  const documents = db.select().from(schema.documents).all();
  const documentCountByProject = new Map<string, number>();
  for (const document of documents) {
    documentCountByProject.set(
      document.projectId,
      (documentCountByProject.get(document.projectId) ?? 0) + 1
    );
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold">需求方案</h1>
          <p className="text-sm text-muted-foreground mt-1">
            按需求方案组织 PRD、交互原型、附录说明和评审记录。
          </p>
        </div>
        <ProjectCreateDialog />
      </header>

      {projects.length === 0 ? (
        <section className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-muted">
            <FolderPlus size={22} />
          </div>
          <h2 className="text-lg font-medium">还没有需求方案</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            创建第一个需求方案后，就可以集中管理 PRD、交互原型和附录说明。
          </p>
          <div className="mt-5">
            <ProjectCreateDialog
              label="创建第一个需求方案"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            />
          </div>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const documentCount = documentCountByProject.get(project.id) ?? 0;
            return (
              <Link
                key={project.id}
                href={`/solutions/${project.id}`}
                className="group rounded-xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
              >
                <div
                  className="mb-4 h-2 w-16 rounded-full transition group-hover:w-24"
                  style={{ background: project.color }}
                />
                <h2 className="font-medium">{project.name}</h2>
                {project.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {project.description}
                  </p>
                )}
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <FileText size={14} />
                    {documentCount} 个资产
                  </span>
                  <span>{formatDate(project.updatedAt)}</span>
                </div>
              </Link>
            );
          })}
        </section>
      )}
    </div>
  );
}
