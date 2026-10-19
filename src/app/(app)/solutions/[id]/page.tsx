import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import {
  ArrowLeft,
  Download,
  Eye,
  FileArchive,
  FileCode2,
  FileText,
  FileUp,
  MessageSquareText,
  UploadCloud,
  UsersRound,
} from "lucide-react";
import { requirePageAuth } from "@/lib/auth";
import {
  canDownloadAssets,
  canModifySolutions,
  canParticipateInReview,
} from "@/lib/auth/permissions";
import { schema } from "@/lib/db";
import { getRequestContext } from "@/lib/tenants/server";
import {
  getProjectReadSummaries,
  recordProjectRead,
  type ProjectReadSummary,
} from "@/lib/project-reads";
import { getSolutionReviewData } from "@/lib/solution-review";
import ReviewIssueLedger from "@/components/ReviewIssueLedger";
import AssetVersionSheet from "@/components/AssetVersionSheet";
import SolutionAssetUploadDialog from "@/components/SolutionAssetUploadDialog";
import DocumentActions from "@/components/DocumentActions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AssetDocument = typeof schema.documents.$inferSelect;
type AssetVersion = typeof schema.versions.$inferSelect;
type PreviewKind = "md" | "html";
type AssetPreview = {
  title: string;
  lines: string[];
};
type SolutionActivity = {
  id: string;
  kind: "version" | "review" | "read";
  title: string;
  detail: string;
  occurredAt: Date;
  href?: string;
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

function buildSolutionActivities({
  documents,
  versions,
  issues,
  reads,
}: {
  documents: AssetDocument[];
  versions: AssetVersion[];
  issues: NonNullable<ReturnType<typeof getSolutionReviewData>>["issues"];
  reads: ProjectReadSummary[];
}) {
  const documentById = new Map(documents.map((document) => [document.id, document]));
  const userById = new Map(reads.map((read) => [read.userId, read.displayName]));

  const versionActivities: SolutionActivity[] = versions.flatMap((version) => {
    const document = documentById.get(version.documentId);
    if (!document) return [];
    const author = userById.get(version.createdBy);
    return [
      {
        id: `version-${version.id}`,
        kind: "version",
        title: `${document.title} 新增版本`,
        detail: [author, version.message || null, formatSize(version.size)]
          .filter(Boolean)
          .join(" · "),
        occurredAt: version.createdAt,
      },
    ];
  });
  const reviewActivities: SolutionActivity[] = issues.map((issue) => ({
    id: `review-${issue.id}`,
    kind: "review",
    title: `${issue.authorName} 提交评审意见`,
    detail: `${issue.documentType} · ${issue.body}`,
    occurredAt: new Date(issue.createdAt),
    href: issue.href,
  }));
  const readActivities: SolutionActivity[] = reads.flatMap((read) =>
    read.hasRead && read.lastReadAt
      ? [
          {
            id: `read-${read.userId}`,
            kind: "read" as const,
            title: `${read.displayName} 查看了需求方案`,
            detail: `累计查看 ${read.readCount} 次`,
            occurredAt: read.lastReadAt,
          },
        ]
      : []
  );

  return [...versionActivities, ...reviewActivities, ...readActivities]
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
    .slice(0, 30);
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

function ReadStatusSummary({ summaries }: { summaries: ProjectReadSummary[] }) {
  const readSummaries = summaries.filter((item) => item.hasRead);
  const previewSummaries = readSummaries.slice(0, 3);

  return (
    <details data-solution-read-status-panel="true" className="group relative shrink-0">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-primary hover:text-foreground [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1.5">
          <UsersRound size={13} />
          阅读 {readSummaries.length}/{summaries.length}
        </span>
        {previewSummaries.length > 0 && (
          <span className="inline-flex items-center pl-1">
            {previewSummaries.map((item) => (
              <span
                key={item.userId}
                className="-ml-1 flex h-5 w-5 items-center justify-center rounded-full border border-background text-[10px] font-medium text-white"
                style={{ background: item.avatarColor }}
                title={item.displayName}
              >
                {item.displayName.slice(0, 1).toUpperCase()}
              </span>
            ))}
          </span>
        )}
        <span className="text-[10px] transition-transform group-open:rotate-180">⌄</span>
      </summary>

      {readSummaries.length ? (
        <div className="absolute right-0 z-30 mt-2 w-[min(360px,calc(100vw-40px))] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-elev-2">
          {readSummaries.map((item) => (
            <div
              key={item.userId}
              data-solution-read-status-entry="true"
              className="flex min-w-0 items-center justify-between gap-3 border-t border-border px-3 py-2 first:border-t-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white"
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
                    最近查看于 {item.lastReadAt ? formatDate(item.lastReadAt) : "-"}
                  </div>
                </div>
              </div>
              <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                {item.readCount} 次
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="absolute right-0 z-30 mt-2 w-56 rounded-lg border border-border bg-popover px-3 py-3 text-sm text-muted-foreground shadow-elev-2">
          暂无成员查看该需求方案。
        </div>
      )}
    </details>
  );
}

function ReviewEntryButton({ href }: { href: string | null }) {
  if (!href) {
    return (
      <span
        data-solution-review-entry="header"
        aria-disabled="true"
        className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground opacity-45"
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
      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
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
  markdownContent,
  prototypePreviewSrc,
}: {
  kind: PreviewKind;
  preview: AssetPreview;
  empty: boolean;
  markdownContent?: string;
  prototypePreviewSrc?: string;
}) {
  if (empty) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center border-y border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
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
        className="flex min-h-0 flex-1 flex-col overflow-hidden border-y border-border bg-slate-950"
      >
        <div className="flex h-7 shrink-0 items-center gap-1 border-b border-white/10 bg-slate-900 px-3">
          <span className="h-2 w-2 rounded-full bg-red-400" />
          <span className="h-2 w-2 rounded-full bg-amber-300" />
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="ml-2 h-2 flex-1 rounded-full bg-white/10" />
        </div>
        {prototypePreviewSrc ? (
          <div
            data-solution-prototype-viewport="adaptive"
            className="min-h-0 w-full flex-1 overflow-hidden bg-white"
          >
            <iframe
              data-solution-prototype-frame="true"
              src={prototypePreviewSrc}
              title={`${preview.title} 预览`}
              className="h-[200%] w-[200%] origin-top-left scale-50 border-0"
              sandbox="allow-scripts allow-forms allow-modals allow-popups"
            />
          </div>
        ) : (
          <div
            data-solution-prototype-viewport="adaptive"
            className="min-h-0 w-full flex-1 bg-white p-5"
          >
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
      data-solution-markdown-scroll="true"
      className="min-h-0 flex-1 overflow-y-auto border-y border-border bg-background px-5 py-4"
    >
      <article className="prose-prd mx-auto max-w-3xl text-sm text-foreground [&>:first-child]:mt-0">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[
            rehypeKatex,
            [rehypeHighlight, { detect: false, ignoreMissing: true }],
          ]}
        >
          {markdownContent || `# ${preview.title}\n\n${preview.lines.join("\n\n")}`}
        </ReactMarkdown>
      </article>
    </div>
  );
}

function AssetPreviewCard({
  kind,
  label,
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
      className="flex h-[556px] flex-col overflow-hidden rounded-md border border-border bg-card"
    >
      <div
        data-solution-asset-header={kind}
        className="flex h-12 shrink-0 items-center justify-between gap-3 px-3"
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="shrink-0 text-muted-foreground">
            {icon}
          </div>
          <h2 className="truncate text-sm font-semibold">{label}</h2>
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

      <RenderedPreview
        kind={kind}
        preview={preview}
        empty={!document}
        markdownContent={kind === "md" ? current?.content ?? undefined : undefined}
        prototypePreviewSrc={prototypePreviewSrc}
      />
      <div
        data-solution-asset-footer={kind}
        className="flex h-12 shrink-0 flex-wrap items-center justify-between gap-3 px-3"
      >
        <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{current ? formatSize(current.size) : "暂无文件"}</span>
          {document && <span>更新于 {formatDate(document.updatedAt)}</span>}
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
            {(canModify || exportHref) && (
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
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function ActivityFeed({ activities }: { activities: SolutionActivity[] }) {
  return (
    <section
      data-solution-activity-feed="true"
      className="overflow-hidden rounded-md border border-border bg-card"
    >
      {activities.length ? (
        <div className="divide-y divide-border">
          {activities.map((activity) => {
            const Icon =
              activity.kind === "version"
                ? FileUp
                : activity.kind === "review"
                  ? MessageSquareText
                  : Eye;
            const content = (
              <>
                <span className="mt-0.5 shrink-0 text-muted-foreground">
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{activity.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {activity.detail}
                  </span>
                </span>
                <time className="shrink-0 text-xs text-muted-foreground">
                  {formatDate(activity.occurredAt)}
                </time>
              </>
            );

            return activity.href ? (
              <Link
                key={activity.id}
                href={activity.href}
                className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted/40"
              >
                {content}
              </Link>
            ) : (
              <div key={activity.id} className="flex items-start gap-3 px-3 py-2.5">
                {content}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-3 py-8 text-center text-sm text-muted-foreground">
          暂无活动记录。
        </div>
      )}
    </section>
  );
}

function AppendixSection({
  solutionId,
  appendices,
  versionsByDocument,
  canModify,
  canDownload,
}: {
  solutionId: string;
  appendices: AssetDocument[];
  versionsByDocument: Map<string, AssetVersion[]>;
  canModify: boolean;
  canDownload: boolean;
}) {
  return (
    <section className="rounded-md border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <h2 className="truncate text-sm font-semibold">附录说明</h2>
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
                className="grid gap-3 px-3 py-2.5 hover:bg-muted/40 md:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
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
                {(canModify || canDownload) && (
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
                    {canDownload && (
                      <Link
                        href={`/api/appendices/${appendix.id}/download`}
                        className={textButtonClass()}
                      >
                        下载
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
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
  const currentUser = await requirePageAuth();
  const { db } = await getRequestContext();
  const solution = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get();

  if (!solution) {
    notFound();
  }

  if (currentUser) {
    recordProjectRead(db, solution.id, currentUser.id);
  }

  const canModify = currentUser ? canModifySolutions(currentUser) : false;
  const canReview = currentUser ? canParticipateInReview(currentUser) : false;
  const canDownload = currentUser ? canDownloadAssets(currentUser) : false;
  const readSummaries = getProjectReadSummaries(db, solution.id);
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
  const reviewData = getSolutionReviewData(db, id);
  const reviewIssues = reviewData?.issues ?? [];
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
  const activities = buildSolutionActivities({
    documents,
    versions: reviewData?.versions ?? [],
    issues: reviewIssues,
    reads: readSummaries,
  });

  return (
    <div data-solution-detail-layout="workspace" className="p-5">
      <header data-solution-detail-header="compact" className="pb-1">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="w-full min-w-0 md:w-auto md:flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <Link
                href="/projects"
                aria-label="返回需求方案列表"
                title="返回需求方案列表"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft size={17} />
              </Link>
              <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold md:flex-none">
                {solution.name}
              </h1>
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                更新于 {formatDate(solution.updatedAt)}
              </span>
            </div>
            {solution.description && (
              <p className="mt-2 line-clamp-1 max-w-3xl pl-10 text-sm leading-5 text-muted-foreground">
                {solution.description}
              </p>
            )}
          </div>

          <div className="flex w-full shrink-0 flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end">
            <ReadStatusSummary summaries={readSummaries} />
            {canReview && <ReviewEntryButton href={reviewEntryHref} />}
            {canDownload && (
              <span className="group relative inline-flex">
                <a
                  href={`/api/solutions/${solution.id}/review-context`}
                  aria-label="下载评审上下文"
                  aria-describedby="review-context-download-tooltip"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Download size={15} />
                </a>
                <span
                  id="review-context-download-tooltip"
                  role="tooltip"
                  className="pointer-events-none absolute right-0 top-full z-40 mt-2 w-64 rounded-md border border-border bg-popover px-3 py-2 text-left opacity-0 shadow-elev-2 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  <span className="block text-xs font-medium text-popover-foreground">
                    下载评审上下文
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    包含当前 PRD、交互原型版本及评审记录。
                  </span>
                </span>
              </span>
            )}
          </div>
        </div>
      </header>

      <Tabs defaultValue="assets" className="mt-2">
        <TabsList
          data-solution-detail-tabs="true"
          className="h-auto w-full justify-start gap-5 rounded-none border-b border-border bg-transparent p-0"
        >
          <TabsTrigger
            value="assets"
            className="rounded-none border-b-2 border-transparent px-0 py-2.5 shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            资产
          </TabsTrigger>
          <TabsTrigger
            value="reviews"
            className="rounded-none border-b-2 border-transparent px-0 py-2.5 shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            评审记录
          </TabsTrigger>
          <TabsTrigger
            value="activity"
            className="rounded-none border-b-2 border-transparent px-0 py-2.5 shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            活动
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="mt-3 space-y-3">
          <section data-solution-asset-rail="primary" className="grid gap-3 xl:grid-cols-2">
            <AssetPreviewCard
              kind="md"
              label="PRD"
              icon={<FileText size={16} />}
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
              primaryLabel={canModify ? "编辑" : canReview ? "评审" : "查看"}
              exportHref={
                canDownload && prd && selectedPrdVersion
                  ? `/api/documents/${prd.id}/versions/${selectedPrdVersion.id}/download`
                  : undefined
              }
              exportLabel="导出 PRD"
              canModify={canModify}
            />

            <AssetPreviewCard
              kind="html"
              label="交互原型"
              icon={<FileCode2 size={16} />}
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
                canDownload && prototype && selectedPrototypeVersion
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
            canDownload={canDownload}
          />
        </TabsContent>

        <TabsContent
          value="reviews"
          forceMount
          className="mt-3 data-[state=inactive]:hidden"
        >
          <ReviewIssueLedger issues={reviewIssues} canManageIssues={canReview} />
        </TabsContent>

        <TabsContent
          value="activity"
          forceMount
          className="mt-3 data-[state=inactive]:hidden"
        >
          <ActivityFeed activities={activities} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
