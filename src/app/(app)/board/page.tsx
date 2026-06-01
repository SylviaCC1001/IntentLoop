import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { reviewStatusLabels, type ReviewIssueStatus } from "@/lib/solution-review/types";

const columns = [
  { status: "open", label: "待处理" },
  { status: "handled", label: "已处理" },
  { status: "closed", label: "已关闭" },
] as const;

export default async function BoardPage() {
  const comments = db
    .select()
    .from(schema.comments)
    .orderBy(desc(schema.comments.createdAt))
    .all();
  const documents = db.select().from(schema.documents).all();
  const projects = db.select().from(schema.projects).all();
  const documentById = new Map(documents.map((document) => [document.id, document]));
  const projectById = new Map(projects.map((project) => [project.id, project]));

  return (
    <div className="space-y-6 p-6">
      <header className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Review Board
        </div>
        <h1 className="mt-1 text-2xl font-semibold">评审看板</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          按处理状态汇总全部需求方案中的 PRD 与原型评审问题。
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        {columns.map((column) => {
          const columnComments = comments.filter((comment) => {
            if (column.status === "closed") {
              return comment.status === "closed" || comment.status === "resolved";
            }
            return comment.status === column.status;
          });

          return (
            <div key={column.status} className="rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-sm font-medium">{column.label}</h2>
                <span className="text-xs text-muted-foreground">
                  {columnComments.length}
                </span>
              </div>
              <div className="space-y-2 p-3">
                {columnComments.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    暂无评审问题
                  </div>
                ) : (
                  columnComments.map((comment) => {
                    const document = documentById.get(comment.documentId);
                    const project = document ? projectById.get(document.projectId) : null;
                    const status = comment.status as ReviewIssueStatus;
                    return (
                      <Link
                        key={comment.id}
                        href={project ? `/solutions/${project.id}` : "/projects"}
                        className="block rounded-md border border-border bg-background p-3 hover:border-primary"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            {reviewStatusLabels[status] ?? column.label}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {document?.type.toUpperCase() ?? "DOC"}
                          </span>
                        </div>
                        <div className="mt-2 line-clamp-2 text-sm font-medium">
                          {comment.body}
                        </div>
                        <div className="mt-2 truncate text-xs text-muted-foreground">
                          {project?.name ?? "未知需求方案"} · {document?.title ?? "未知文档"}
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
