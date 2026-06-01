import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import {
  ArrowLeft,
  Download,
  FileArchive,
  FileCode2,
  FileText,
  Paperclip,
} from "lucide-react";
import { db, schema } from "@/lib/db";
import { getSolutionReviewData } from "@/lib/solution-review";
import ReviewIssueLedger from "@/components/ReviewIssueLedger";
import SolutionAssetUploadDialog from "@/components/SolutionAssetUploadDialog";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

type AssetDocument = typeof schema.documents.$inferSelect;
type AssetVersion = typeof schema.versions.$inferSelect;

type AssetCardProps = {
  title: string;
  description: string;
  icon: ReactNode;
  upload: ReactNode;
  document: AssetDocument | null;
  versions: AssetVersion[];
  emptyText: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

function AssetCard({
  title,
  description,
  icon,
  upload,
  document,
  versions,
  emptyText,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: AssetCardProps) {
  const current = versions.find((version) => version.id === document?.currentVersionId);

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="shrink-0">{upload}</div>
      </div>

      <div className="space-y-4 p-4">
        {document ? (
          <>
            <div className="rounded-md border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{document.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    当前版本 {current ? formatSize(current.size) : "暂无文件"} · 更新于{" "}
                    {formatDate(document.updatedAt)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {secondaryHref && secondaryLabel && (
                    <Link
                      href={secondaryHref}
                      className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      {secondaryLabel}
                    </Link>
                  )}
                  {primaryHref && primaryLabel && (
                    <Link
                      href={primaryHref}
                      className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                    >
                      {primaryLabel}
                    </Link>
                  )}
                </div>
              </div>
            {document.description && (
              <p className="mt-3 text-sm text-muted-foreground">
                {document.description}
              </p>
            )}
            {current?.message && (
              <div className="mt-3 rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm">
                <span className="font-medium">当前版本说明：</span>
                <span className="text-muted-foreground">{current.message}</span>
              </div>
            )}
          </div>

          <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                版本更新说明 / 版本记录
              </div>
              <div className="space-y-2">
                {versions.length ? (
                  versions.map((version) => (
                    <div
                      key={version.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate">
                          {version.message || "未填写更新说明"}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(version.createdAt)} · {formatSize(version.size)}
                        </div>
                      </div>
                      {version.id === document.currentVersionId && (
                        <span className="shrink-0 rounded bg-accent px-2 py-1 text-xs text-primary">
                          当前
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                    暂无版本记录
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        )}
      </div>
    </section>
  );
}

export default async function SolutionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const solution = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get();

  if (!solution) {
    notFound();
  }

  const documents = db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.projectId, id))
    .orderBy(desc(schema.documents.updatedAt))
    .all();
  const versions = db
    .select()
    .from(schema.versions)
    .orderBy(desc(schema.versions.createdAt))
    .all();
  const versionsByDocument = new Map<string, AssetVersion[]>();
  for (const version of versions) {
    if (!documents.some((document) => document.id === version.documentId)) continue;
    versionsByDocument.set(version.documentId, [
      ...(versionsByDocument.get(version.documentId) ?? []),
      version,
    ]);
  }

  const prd = documents.find((document) => document.type === "md") ?? null;
  const prototype =
    documents.find((document) => document.type === "html" || document.type === "html-zip") ??
    null;
  const appendices = documents.filter((document) => document.type === "appendix");
  const reviewData = getSolutionReviewData(id);
  const reviewIssues = reviewData?.issues ?? [];
  const openIssueCount = reviewIssues.filter((issue) => issue.status === "open").length;
  const handledIssueCount = reviewIssues.filter((issue) => issue.status === "handled").length;
  const closedIssueCount = reviewIssues.length - openIssueCount - handledIssueCount;

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
          返回需求方案列表
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 text-sm text-muted-foreground">需求方案</div>
            <h1 className="truncate text-2xl font-semibold">{solution.name}</h1>
            {solution.description && (
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                {solution.description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
              更新于 {formatDate(solution.updatedAt)}
            </div>
            <a
              href={`/api/solutions/${solution.id}/review-context`}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              <Download size={14} />
              导出评审上下文
            </a>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          {[
            ["PRD", prd ? "已上传" : "待上传"],
            ["交互原型", prototype ? "已上传" : "待上传"],
            ["附录", `${appendices.length} 个`],
            ["待处理评审", `${openIssueCount} 条`],
            ["已处理/关闭", `${handledIssueCount + closedIssueCount} 条`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-background px-3 py-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="mt-1 text-sm font-semibold">{value}</div>
            </div>
          ))}
        </div>
      </header>

      <ReviewIssueLedger issues={reviewIssues} />

      <div className="grid gap-6 xl:grid-cols-2">
        <AssetCard
          title="PRD"
          description="Markdown 需求文档。上传新 MD 或点击发版都会形成新的版本记录。"
          icon={<FileText size={18} />}
          upload={
            <SolutionAssetUploadDialog
              solutionId={solution.id}
              assetType="prd"
              label="上传 PRD"
              title="上传 PRD"
              accept=".md,text/markdown"
              helpText="仅支持 Markdown 文件；重复上传会成为新的 PRD 版本。"
              defaultTitle="PRD"
            />
          }
          document={prd}
          versions={prd ? versionsByDocument.get(prd.id) ?? [] : []}
          emptyText="还没有 PRD。上传 Markdown 文件后开始编辑和评审。"
          primaryHref={prd ? `/docs/${prd.id}?mode=edit` : undefined}
          primaryLabel="编辑 PRD"
          secondaryHref={prd ? `/docs/${prd.id}?mode=review` : undefined}
          secondaryLabel="评审"
        />

        <AssetCard
          title="交互原型"
          description="HTML 或 zip 原型包。每次上传都会保留为一次原型版本。"
          icon={<FileCode2 size={18} />}
          upload={
            <SolutionAssetUploadDialog
              solutionId={solution.id}
              assetType="prototype"
              label="上传原型"
              title="上传交互原型"
              accept=".html,.htm,.zip,text/html,application/zip"
              helpText="支持单 HTML 或包含 index.html 的 zip 原型包。"
              defaultTitle="交互原型"
            />
          }
          document={prototype}
          versions={prototype ? versionsByDocument.get(prototype.id) ?? [] : []}
          emptyText="还没有交互原型。上传 HTML 或 zip 后可在线预览。"
          primaryHref={prototype ? `/docs/${prototype.id}` : undefined}
          primaryLabel="查看原型"
        />
      </div>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
              <Paperclip size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold">附录说明</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                图片、Excel、PDF 或其他补充材料；附录不做版本历史。
              </p>
            </div>
          </div>
          <SolutionAssetUploadDialog
            solutionId={solution.id}
            assetType="appendix"
            label="上传附录"
            title="上传附录说明"
            accept=""
            helpText="支持图片、PDF、Excel、文本等补充材料。"
          />
        </div>

        <div className="p-4">
          {appendices.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {appendices.map((appendix) => {
                const current = appendix.currentVersionId
                  ? versionsByDocument
                      .get(appendix.id)
                      ?.find((version) => version.id === appendix.currentVersionId)
                  : null;
                return (
                  <div
                    key={appendix.id}
                    className="rounded-md border border-border bg-background p-3"
                  >
                    <div className="flex items-start gap-3">
                      <FileArchive size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{appendix.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {current ? formatSize(current.size) : "暂无文件"} ·{" "}
                          {formatDate(appendix.updatedAt)}
                        </div>
                        {appendix.description && (
                          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                            {appendix.description}
                          </p>
                        )}
                        <Link
                          href={`/api/appendices/${appendix.id}/download`}
                          className="mt-3 inline-flex rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                        >
                          下载
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
              还没有附录说明。上传补充材料后会在这里聚合展示。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
