import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  FileArchive,
  FileCode2,
  FileText,
  Paperclip,
  UploadCloud,
  UsersRound,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { canModifySolutions } from "@/lib/auth/permissions";
import { db, schema } from "@/lib/db";
import {
  getProjectReadSummaries,
  recordProjectRead,
  type ProjectReadSummary,
} from "@/lib/project-reads";
import { getSolutionReviewData } from "@/lib/solution-review";
import ReviewLedgerSheet from "@/components/ReviewLedgerSheet";
import AssetVersionSheet from "@/components/AssetVersionSheet";
import SolutionAssetUploadDialog from "@/components/SolutionAssetUploadDialog";
import DocumentActions from "@/components/DocumentActions";

type AssetDocument = typeof schema.documents.$inferSelect;
type AssetVersion = typeof schema.versions.$inferSelect;
type PreviewKind = "md" | "html";
type AssetPreview = {
  title: string;
  lines: string[];
};

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

function getCurrentVersion(document: AssetDocument | null, versions: AssetVersion[]) {
  return versions.find((version) => version.id === document?.currentVersionId) ?? null;
}

function getSelectedVersion(
  document: AssetDocument | null,
  versions: AssetVersion[],
  versionId?: string | null
) {
  return (
    (versionId ? versions.find((version) => version.id === versionId) : null) ??
    getCurrentVersion(document, versions)
  );
}

function prototypeModeHref(
  documentId: string,
  mode: "preview" | "review" | "joint",
  versionId?: string | null
) {
  const params = new URLSearchParams();
  if (mode !== "review") params.set("mode", mode);
  if (versionId) params.set("version", versionId);
  const query = params.toString();
  return query ? `/docs/${documentId}?${query}` : `/docs/${documentId}`;
}

function solutionVersionHref({
  solutionId,
  prdVersionId,
  prototypeVersionId,
}: {
  solutionId: string;
  prdVersionId?: string | null;
  prototypeVersionId?: string | null;
}) {
  const params = new URLSearchParams();
  if (prdVersionId) params.set("prdVersion", prdVersionId);
  if (prototypeVersionId) params.set("prototypeVersion", prototypeVersionId);
  const query = params.toString();
  return query ? `/solutions/${solutionId}?${query}` : `/solutions/${solutionId}`;
}

function prototypeSrc(storagePath: string | null | undefined) {
  if (!storagePath) return "";
  const normalized = storagePath.startsWith("prototypes/")
    ? storagePath.slice("prototypes/".length)
    : storagePath;
  return `/proto/${normalized}`;
}

function uploadButtonClass() {
  return "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted";
}

function textButtonClass(primary = false) {
  if (primary) {
    return "rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90";
  }
  return "rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted";
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function compactText(value: string) {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

function cleanMarkdownLine(line: string) {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s?/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~#]/g, "")
    .trim();
}

function extractMarkdownPreview(content: string, fallbackTitle: string): AssetPreview {
  const lines = content
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const headingLine = lines.find((line) => /^#{1,6}\s+/.test(line));
  const title = headingLine ? cleanMarkdownLine(headingLine) : fallbackTitle;
  const bodyLines = lines
    .filter((line) => line !== headingLine && !line.startsWith("```"))
    .map(cleanMarkdownLine)
    .filter((line) => line && line !== title)
    .slice(0, 8);

  return {
    title,
    lines: bodyLines.length ? bodyLines : [fallbackTitle],
  };
}

function stripHtml(value: string) {
  return compactText(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function readHtmlTag(content: string, tag: string) {
  const match = content.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripHtml(match[1]) : "";
}

function extractHtmlPreview(content: string, fallbackTitle: string): AssetPreview {
  const title =
    readHtmlTag(content, "h1") ||
    readHtmlTag(content, "h2") ||
    readHtmlTag(content, "title") ||
    fallbackTitle;
  const fragments = Array.from(
    content.matchAll(/<(p|li|button|span|h2|h3|label)[^>]*>([\s\S]*?)<\/\1>/gi)
  )
    .map((match) => stripHtml(match[2]))
    .filter((line) => line && line !== title)
    .slice(0, 5);
  const fullText = stripHtml(content);

  return {
    title,
    lines: fragments.length ? fragments : [fullText.replace(title, "").trim()].filter(Boolean),
  };
}

function getAssetPreview(
  document: AssetDocument | null,
  version: AssetVersion | null,
  fallbackTitle: string,
  kind: PreviewKind
): AssetPreview {
  const content = version?.content?.trim();
  if (!document || !content) {
    return {
      title: document?.title ?? fallbackTitle,
      lines: [document?.description ?? "上传后会显示最新渲染预览。"],
    };
  }
  if (kind === "md") return extractMarkdownPreview(content, document.title);
  return extractHtmlPreview(content, document.title);
}

function SummaryStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function StatusBadge({ uploaded }: { uploaded: boolean }) {
  return (
    <span
      className={
        uploaded
          ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
          : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
      }
    >
      {uploaded ? "已上传" : "待上传"}
    </span>
  );
}

function ReadStatusPanel({ summaries }: { summaries: ProjectReadSummary[] }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <UsersRound size={16} />
            阅读查看情况
          </h2>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            记录成员打开该需求方案的查看状态和最近查看时间。
          </p>
        </div>
        <span className="rounded border border-border px-2 py-1 text-xs text-muted-foreground">
          {summaries.filter((item) => item.hasRead).length}/{summaries.length} 已读
        </span>
      </div>

      <div className="grid divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
        {summaries.map((item) => (
          <div key={item.userId} className="flex min-w-0 items-center gap-3 px-4 py-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white"
              style={{ background: item.avatarColor }}
            >
              {item.displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{item.displayName}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {item.roleLabel}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {item.hasRead && item.lastReadAt
                  ? `${formatDate(item.lastReadAt)} · ${item.readCount} 次`
                  : "未查看"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReviewEntryButton({ href }: { href: string | null }) {
  if (!href) {
    return (
      <span
        data-solution-review-entry="header"
        aria-disabled="true"
        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground opacity-45"
      >
        <Eye size={14} />
        评审
      </span>
    );
  }

  return (
    <Link
      data-solution-review-entry="header"
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
    >
      <Eye size={14} />
      评审
    </Link>
  );
}

function RenderedPreview({
  kind,
  preview,
  empty,
  prototypePreviewSrc,
}: {
  kind: PreviewKind;
  preview: AssetPreview;
  empty: boolean;
  prototypePreviewSrc?: string;
}) {
  if (empty) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-border bg-background text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <UploadCloud className="h-4 w-4" />
          上传后显示最新页面切图
        </div>
      </div>
    );
  }

  if (kind === "html") {
    return (
      <div
        data-solution-render-preview="html"
        className="overflow-hidden rounded-xl border border-border bg-slate-950"
      >
        <div className="flex h-7 items-center gap-1 border-b border-white/10 bg-slate-900 px-3">
          <span className="h-2 w-2 rounded-full bg-red-400" />
          <span className="h-2 w-2 rounded-full bg-amber-300" />
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="ml-2 h-2 flex-1 rounded-full bg-white/10" />
        </div>
        {prototypePreviewSrc ? (
          <div className="h-[360px] overflow-hidden bg-white">
            <iframe
              data-solution-prototype-frame="true"
              src={prototypePreviewSrc}
              title={`${preview.title} 预览`}
              className="h-[720px] w-[200%] origin-top-left scale-50 border-0"
              sandbox="allow-scripts allow-forms allow-modals allow-popups"
            />
          </div>
        ) : (
          <div className="min-h-[360px] bg-white p-5">
            <div className="mb-3 h-7 w-28 rounded-full bg-sky-100" />
            <h3 className="line-clamp-2 text-xl font-semibold text-slate-950">{preview.title}</h3>
            <div className="mt-4 space-y-2">
              {preview.lines.slice(0, 3).map((line) => (
                <div key={line} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                  {line}
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <span className="h-8 w-20 rounded-md bg-blue-500" />
              <span className="h-8 w-20 rounded-md border border-slate-200" />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-solution-render-preview="md"
      className="min-h-[360px] rounded-xl border border-border bg-slate-100 p-5"
    >
      <div className="mx-auto min-h-[316px] max-w-[82%] rounded-lg bg-white px-6 py-6 shadow-sm">
        <div className="mb-3 h-2 w-16 rounded-full bg-slate-200" />
        <h3 className="line-clamp-2 text-xl font-semibold text-slate-950">{preview.title}</h3>
        <div className="mt-4 space-y-2">
          {preview.lines.slice(0, 8).map((line) => (
            <p key={line} className="text-sm leading-6 text-slate-600">
              {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

function AssetPreviewCard({
  kind,
  label,
  description,
  icon,
  document,
  versions,
  selectedVersion,
  upload,
  primaryHref,
  primaryLabel,
  exportHref,
  exportLabel,
  canModify,
}: {
  kind: PreviewKind;
  label: string;
  description: string;
  icon: ReactNode;
  document: AssetDocument | null;
  versions: AssetVersion[];
  selectedVersion: AssetVersion | null;
  upload: ReactNode;
  primaryHref?: string;
  primaryLabel?: string;
  exportHref?: string;
  exportLabel?: string;
  canModify: boolean;
}) {
  const current = selectedVersion ?? getCurrentVersion(document, versions);
  const preview = getAssetPreview(document, current, label, kind);
  const prototypePreviewSrc = kind === "html" ? prototypeSrc(current?.storagePath) : "";

  return (
    <section
      data-solution-asset-card={kind}
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">{label}</h2>
              <StatusBadge uploaded={Boolean(document)} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {primaryHref && primaryLabel && (
            <Link href={primaryHref} className={textButtonClass(true)}>
              {primaryLabel}
            </Link>
          )}
          {upload}
        </div>
      </div>

      <div className="p-4">
        <RenderedPreview
          kind={kind}
          preview={preview}
          empty={!document}
          prototypePreviewSrc={prototypePreviewSrc}
        />
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{document?.title ?? label}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{current ? formatSize(current.size) : "暂无文件"}</span>
              {document && <span>更新于 {formatDate(document.updatedAt)}</span>}
            </div>
          </div>
          {document && (
            <div
              data-solution-asset-footer-actions={kind}
              className="ml-auto flex shrink-0 items-center justify-end gap-2"
            >
              <AssetVersionSheet
                documentTitle={document.title}
                versions={versions.map((version) => ({
                  id: version.id,
                  message: version.message,
                  size: version.size,
                  createdAt: version.createdAt,
                  href:
                    kind === "md"
                      ? solutionVersionHref({
                          solutionId: document.projectId,
                          prdVersionId: version.id,
                        })
                      : solutionVersionHref({
                          solutionId: document.projectId,
                          prototypeVersionId: version.id,
                        }),
                }))}
                currentVersionId={document.currentVersionId}
                selectedVersionId={current?.id ?? null}
                className="h-8"
              />
              <DocumentActions
                document={{
                  id: document.id,
                  title: document.title,
                  description: document.description,
                  priority: document.priority,
                }}
                exportHref={exportHref}
                exportLabel={exportLabel}
                canModify={canModify}
                className="h-8"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function AppendixSection({
  solutionId,
  appendices,
  versionsByDocument,
  canModify,
}: {
  solutionId: string;
  appendices: AssetDocument[];
  versionsByDocument: Map<string, AssetVersion[]>;
  canModify: boolean;
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">附录说明</h2>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            图片、Excel、PDF 或其他补充材料；附录不做版本历史。
          </p>
        </div>
        {canModify && (
          <SolutionAssetUploadDialog
            solutionId={solutionId}
            assetType="appendix"
            label="上传附录"
            title="上传附录说明"
            accept=""
            helpText="支持图片、PDF、Excel、文本等补充材料。"
            className={uploadButtonClass()}
          />
        )}
      </div>

      <div data-solution-appendix-list="compact" className="divide-y divide-border">
        {appendices.length ? (
          appendices.map((appendix) => {
            const current = appendix.currentVersionId
              ? versionsByDocument
                  .get(appendix.id)
                  ?.find((version) => version.id === appendix.currentVersionId)
              : null;

            return (
              <div
                key={appendix.id}
                className="grid gap-3 px-4 py-3 hover:bg-muted/40 md:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <FileArchive size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{appendix.title}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{current ? formatSize(current.size) : "暂无文件"}</span>
                      <span>更新于 {formatDate(appendix.updatedAt)}</span>
                      {appendix.description && (
                        <span className="truncate">{appendix.description}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 md:justify-end">
                  {canModify && (
                    <DocumentActions
                      document={{
                        id: appendix.id,
                        title: appendix.title,
                        description: appendix.description,
                        priority: appendix.priority,
                      }}
                      canModify={canModify}
                    />
                  )}
                  <Link href={`/api/appendices/${appendix.id}/download`} className={textButtonClass()}>
                    下载
                  </Link>
                </div>
              </div>
            );
          })
        ) : (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            还没有附录说明。上传补充材料后会在这里聚合展示。
          </div>
        )}
      </div>
    </section>
  );
}

export default async function SolutionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ prdVersion?: string; prototypeVersion?: string }>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const currentUser = await getCurrentUser();
  const solution = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get();

  if (!solution) {
    notFound();
  }

  if (currentUser) {
    recordProjectRead(solution.id, currentUser.id);
  }

  const canModify = currentUser ? canModifySolutions(currentUser) : false;
  const readSummaries = getProjectReadSummaries(solution.id);
  const readUserCount = readSummaries.filter((item) => item.hasRead).length;
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
  const prdVersions = prd ? versionsByDocument.get(prd.id) ?? [] : [];
  const prototypeVersions = prototype ? versionsByDocument.get(prototype.id) ?? [] : [];
  const selectedPrdVersion = getSelectedVersion(prd, prdVersions, query.prdVersion);
  const selectedPrototypeVersion = getSelectedVersion(
    prototype,
    prototypeVersions,
    query.prototypeVersion
  );
  const prdReviewHref = prd ? `/docs/${prd.id}?mode=review` : null;
  const prototypeReviewHref = prototype
    ? prototypeModeHref(prototype.id, "review", selectedPrototypeVersion?.id)
    : null;
  const jointReviewHref = prototype
    ? prototypeModeHref(prototype.id, "joint", selectedPrototypeVersion?.id)
    : null;
  const reviewEntryHref = jointReviewHref ?? prdReviewHref ?? prototypeReviewHref;

  return (
    <div data-solution-detail-layout="workspace" className="space-y-5 p-5">
      <header className="border-b border-border pb-5">
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
          返回需求方案列表
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold">{solution.name}</h1>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                更新于 {formatDate(solution.updatedAt)}
              </span>
            </div>
            {solution.description && (
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {solution.description}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <ReviewEntryButton href={reviewEntryHref} />
            <ReviewLedgerSheet issues={reviewIssues} openCount={openIssueCount} />
            <a
              href={`/api/solutions/${solution.id}/review-context`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <Download size={14} />
              导出评审上下文
            </a>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryStat
            icon={<FileText size={13} />}
            label="PRD"
            value={prd ? `${prdVersions.length} 个版本` : "待上传"}
          />
          <SummaryStat
            icon={<FileCode2 size={13} />}
            label="交互原型"
            value={prototype ? `${prototypeVersions.length} 个版本` : "待上传"}
          />
          <SummaryStat
            icon={<Paperclip size={13} />}
            label="附录"
            value={`${appendices.length} 个`}
          />
          <SummaryStat
            icon={<CheckCircle2 size={13} />}
            label="待处理评审"
            value={`${openIssueCount} 条`}
          />
          <SummaryStat
            icon={<UsersRound size={13} />}
            label="阅读查看"
            value={`${readUserCount}/${readSummaries.length} 人`}
          />
        </div>
      </header>

      <ReadStatusPanel summaries={readSummaries} />

      <section data-solution-asset-rail="primary" className="grid gap-4 xl:grid-cols-2">
        <AssetPreviewCard
          kind="md"
          label="PRD"
          description="Markdown 需求文档。"
          icon={<FileText size={17} />}
          document={prd}
          versions={prdVersions}
          selectedVersion={selectedPrdVersion}
          upload={
            canModify ? (
              <SolutionAssetUploadDialog
                solutionId={solution.id}
                assetType="prd"
                label="上传 PRD"
                title="上传 PRD"
                accept=".md,text/markdown"
                helpText="仅支持 Markdown 文件；重复上传会成为新的 PRD 版本。"
                defaultTitle="PRD"
                className={uploadButtonClass()}
              />
            ) : null
          }
          primaryHref={prd ? `/docs/${prd.id}?mode=${canModify ? "edit" : "review"}` : undefined}
          primaryLabel={canModify ? "编辑" : "评审"}
          exportHref={
            prd && selectedPrdVersion
              ? `/api/documents/${prd.id}/versions/${selectedPrdVersion.id}/download`
              : undefined
          }
          exportLabel="导出 PRD"
          canModify={canModify}
        />

        <AssetPreviewCard
          kind="html"
          label="交互原型"
          description="HTML 或 zip 原型包。"
          icon={<FileCode2 size={17} />}
          document={prototype}
          versions={prototypeVersions}
          selectedVersion={selectedPrototypeVersion}
          upload={
            canModify ? (
              <SolutionAssetUploadDialog
                solutionId={solution.id}
                assetType="prototype"
                label="上传原型"
                title="上传交互原型"
                accept=".html,.htm,.zip,text/html,application/zip"
                helpText="支持单 HTML 或包含 index.html 的 zip 原型包。"
                defaultTitle="交互原型"
                className={uploadButtonClass()}
              />
            ) : null
          }
          primaryHref={
            prototype
              ? prototypeModeHref(prototype.id, "preview", selectedPrototypeVersion?.id)
              : undefined
          }
          primaryLabel="预览"
          exportHref={
            prototype && selectedPrototypeVersion
              ? `/api/documents/${prototype.id}/versions/${selectedPrototypeVersion.id}/download`
              : undefined
          }
          exportLabel="导出 HTML"
          canModify={canModify}
        />
      </section>

      <AppendixSection
        solutionId={solution.id}
        appendices={appendices}
        versionsByDocument={versionsByDocument}
        canModify={canModify}
      />
    </div>
  );
}
