import Link from "next/link";
import { desc } from "drizzle-orm";
import {
  CheckCircle2,
  Edit3,
  Eye,
  FileCode2,
  FileText,
  FolderKanban,
  FolderPlus,
  Paperclip,
} from "lucide-react";
import { db, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canModifySolutions } from "@/lib/auth/permissions";
import { getProjectReadCounts } from "@/lib/project-reads";
import { Badge } from "@/components/ui/badge";
import ProjectCreateDialog from "@/components/ProjectCreateDialog";
import ProjectActions from "@/components/ProjectActions";
import ProjectStatusSelect from "@/components/ProjectStatusSelect";
import { projectStatusLabels } from "@/lib/projects/status";

type ProjectDocument = typeof schema.documents.$inferSelect;
type ProjectVersion = typeof schema.versions.$inferSelect;
type AssetKind = "md" | "html" | "appendix";
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

const statusVariants = {
  draft: "secondary" as const,
  reviewed: "success" as const,
  revised: "warning" as const,
};

function getAssetKind(document: ProjectDocument): AssetKind {
  if (document.type === "md") return "md";
  if (document.type === "appendix") return "appendix";
  return "html";
}

function getAssetShortLabel(document: ProjectDocument) {
  if (document.type === "md") return "MD";
  if (document.type === "html-zip") return "ZIP";
  if (document.type === "appendix") return "APP";
  return "HTML";
}

function getAssetCounts(documents: ProjectDocument[]) {
  return {
    prd: documents.filter((document) => document.type === "md").length,
    prototype: documents.filter(
      (document) => document.type === "html" || document.type === "html-zip"
    ).length,
    appendix: documents.filter((document) => document.type === "appendix").length,
  };
}

function pickThumbnailDocuments(documents: ProjectDocument[]) {
  const prd = documents.find((document) => document.type === "md");
  const prototype = documents.find(
    (document) => document.type === "html" || document.type === "html-zip"
  );
  const appendix = documents.find((document) => document.type === "appendix");
  return [appendix, prototype, prd].filter(Boolean) as ProjectDocument[];
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
  let inCodeFence = false;
  const lines = content
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (/^```/.test(line)) {
        inCodeFence = !inCodeFence;
        return false;
      }
      return Boolean(line) && !inCodeFence;
    });
  const headingLine = lines.find((line) => /^#{1,6}\s+/.test(line));
  const title = headingLine ? cleanMarkdownLine(headingLine) : fallbackTitle;
  const bodyLines = lines
    .filter((line) => line !== headingLine && !line.startsWith("```"))
    .map(cleanMarkdownLine)
    .filter((line) => line && line !== title)
    .slice(0, 3);

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

function removeExecutableHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
}

function readHtmlTag(content: string, tag: string) {
  const match = content.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripHtml(match[1]) : "";
}

function extractHtmlPreview(content: string, fallbackTitle: string): AssetPreview {
  const previewContent = removeExecutableHtml(content);
  const title =
    readHtmlTag(previewContent, "h1") ||
    readHtmlTag(previewContent, "h2") ||
    readHtmlTag(previewContent, "title") ||
    fallbackTitle;
  const fragments = Array.from(
    previewContent.matchAll(/<(p|li|button|span|h2|h3)[^>]*>([\s\S]*?)<\/\1>/gi)
  )
    .map((match) => stripHtml(match[2]))
    .filter((line) => line && line !== title)
    .slice(0, 3);
  const fullText = stripHtml(previewContent);

  return {
    title,
    lines: fragments.length ? fragments : [fullText.replace(title, "").trim()].filter(Boolean),
  };
}

function getAssetPreview(document: ProjectDocument, version?: ProjectVersion): AssetPreview {
  const content = version?.content?.trim();
  if (content && document.type === "md") {
    return extractMarkdownPreview(content, document.title);
  }
  if (content && (document.type === "html" || document.type === "html-zip")) {
    return extractHtmlPreview(content, document.title);
  }

  return {
    title: document.title,
    lines: [document.description, version?.message].filter(Boolean) as string[],
  };
}

function AssetMiniPattern({
  kind,
  preview,
}: {
  kind: AssetKind;
  preview: AssetPreview;
}) {
  if (kind === "html") {
    return (
      <div className="mt-2 rounded-lg border border-sky-100 bg-sky-50/80 p-1.5">
        <div className="mb-1 flex gap-0.5">
          <span className="h-1 w-1 rounded-full bg-rose-300" />
          <span className="h-1 w-1 rounded-full bg-amber-300" />
          <span className="h-1 w-1 rounded-full bg-emerald-300" />
        </div>
        <div className="space-y-1">
          <div className="truncate rounded bg-sky-300/80 px-1 py-0.5 text-[9px] font-bold leading-none text-sky-950">
            {preview.title}
          </div>
          {preview.lines.slice(0, 2).map((line, index) => (
            <div
              key={`${line}-${index}`}
              className="truncate rounded bg-white px-1 py-0.5 text-[9px] leading-none text-slate-500"
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (kind === "appendix") {
    return (
      <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50 p-1.5">
        <div className="truncate rounded bg-amber-300 px-1 py-0.5 text-[9px] font-bold leading-none text-amber-950">
          {preview.title}
        </div>
        <div className="mt-1 grid grid-cols-3 gap-0.5">
          {Array.from({ length: 6 }).map((_, index) => (
            <span
              key={index}
              className={index % 4 === 0 ? "h-2 rounded-sm bg-amber-200" : "h-2 rounded-sm bg-white"}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1.5">
      <div className="truncate rounded bg-slate-200 px-1 py-0.5 text-[9px] font-bold leading-none text-slate-700">
        {preview.title}
      </div>
      {preview.lines.slice(0, 4).map((line, index) => (
        <div
          key={`${line}-${index}`}
          className="truncate rounded bg-slate-100 px-1 py-0.5 text-[9px] leading-none text-slate-500"
        >
          {line}
        </div>
      ))}
    </div>
  );
}

function AssetPaper({
  document,
  version,
  index,
}: {
  document: ProjectDocument;
  version?: ProjectVersion;
  index: number;
}) {
  const kind = getAssetKind(document);
  const preview = getAssetPreview(document, version);
  const stackStyles = [
    { transform: "translate(-70%, -50%) rotate(-18deg)", zIndex: 1 },
    { transform: "translate(-50%, -54%) rotate(13deg)", zIndex: 2 },
    { transform: "translate(-30%, -48%) rotate(-8deg)", zIndex: 3 },
  ];

  return (
    <div
      data-project-asset-kind={kind}
      className="absolute left-1/2 top-1/2 flex h-32 w-24 flex-col overflow-hidden rounded-xl border border-border bg-white p-2.5 shadow-elev-2 dark:bg-slate-800"
      style={stackStyles[index] ?? stackStyles[0]}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={
            kind === "md"
              ? "rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600"
              : kind === "html"
                ? "rounded-md bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold text-sky-700"
                : "rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700"
          }
        >
          {getAssetShortLabel(document)}
        </span>
        <span className="h-1.5 w-1.5 rounded-full bg-border" />
      </div>
      <AssetMiniPattern kind={kind} preview={preview} />
      <div className="mt-auto truncate pt-1.5 text-[10px] font-medium text-muted-foreground">
        {preview.title}
      </div>
    </div>
  );
}

function ProjectAssetStack({
  documents,
  versionsByDocument,
  projectName,
  color,
}: {
  documents: ProjectDocument[];
  versionsByDocument: Map<string, ProjectVersion>;
  projectName: string;
  color: string;
}) {
  const thumbnailDocuments = pickThumbnailDocuments(documents);

  if (!thumbnailDocuments.length) {
    return (
      <div
        data-project-asset-stack
        className="relative h-full min-h-[184px] overflow-hidden rounded-l-2xl bg-gradient-to-br from-slate-50 via-white to-slate-100 p-4 dark:from-slate-900 dark:via-slate-900/80 dark:to-slate-800"
      >
        <div className="absolute left-1/2 top-1/2 flex h-32 w-24 -translate-x-1/2 -translate-y-1/2 rotate-[-10deg] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-white p-3 shadow-elev-1 dark:bg-slate-800">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-bold text-white"
            style={{ background: color }}
          >
            {projectName.charAt(0).toUpperCase()}
          </div>
          <span className="mt-2 text-[10px] text-muted-foreground">待上传</span>
        </div>
      </div>
    );
  }

  return (
    <div
      data-project-asset-stack
      className="relative h-full min-h-[184px] overflow-hidden rounded-l-2xl bg-gradient-to-br from-slate-50 via-white to-slate-100 p-4 dark:from-slate-900 dark:via-slate-900/80 dark:to-slate-800"
    >
      <div className="absolute inset-x-0 bottom-0 h-1.5 opacity-70" style={{ background: color }} />
      {thumbnailDocuments.map((document, index) => (
        <AssetPaper
          key={document.id}
          document={document}
          version={versionsByDocument.get(document.id)}
          index={index}
        />
      ))}
    </div>
  );
}

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  const canModify = user ? canModifySolutions(user) : false;
  const projects = db
    .select()
    .from(schema.projects)
    .orderBy(desc(schema.projects.updatedAt))
    .all();

  const documents = db
    .select()
    .from(schema.documents)
    .orderBy(desc(schema.documents.updatedAt))
    .all();
  const versions = db.select().from(schema.versions).all();
  const currentVersionsByDocument = new Map<string, ProjectVersion>();
  const readCountsByProject = getProjectReadCounts();
  for (const document of documents) {
    if (!document.currentVersionId) continue;
    const currentVersion = versions.find((version) => version.id === document.currentVersionId);
    if (currentVersion) {
      currentVersionsByDocument.set(document.id, currentVersion);
    }
  }
  const documentsByProject = new Map<string, ProjectDocument[]>();
  for (const document of documents) {
    documentsByProject.set(document.projectId, [
      ...(documentsByProject.get(document.projectId) ?? []),
      document,
    ]);
  }

  const totalCount = projects.length;
  const draftCount = projects.filter((p) => p.status === "draft").length;
  const reviewedCount = projects.filter((p) => p.status === "reviewed").length;
  const revisedCount = projects.filter((p) => p.status === "revised").length;

  return (
    <div className="space-y-5 p-5">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">需求方案</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            按需求方案组织 PRD、交互原型、附录说明和评审记录。
          </p>
        </div>
        {canModify && <ProjectCreateDialog />}
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-elev-1 transition-shadow hover:shadow-elev-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <FolderKanban className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-xl font-semibold tabular-nums">{totalCount}</div>
              <div className="text-xs text-muted-foreground">全部方案</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-elev-1 transition-shadow hover:shadow-elev-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
              <Edit3 className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <div className="text-xl font-semibold tabular-nums">{draftCount}</div>
              <div className="text-xs text-muted-foreground">起草中</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-elev-1 transition-shadow hover:shadow-elev-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/30">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="text-xl font-semibold tabular-nums">{reviewedCount}</div>
              <div className="text-xs text-muted-foreground">已评审</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-elev-1 transition-shadow hover:shadow-elev-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/30">
              <FileText className="h-5 w-5 text-amber-600 dark:text-amber-500" />
            </div>
            <div>
              <div className="text-xl font-semibold tabular-nums">{revisedCount}</div>
              <div className="text-xs text-muted-foreground">新修订</div>
            </div>
          </div>
        </div>
      </section>

      {projects.length === 0 ? (
        <section className="rounded-xl border border-dashed border-border bg-card p-12 text-center shadow-elev-1">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-muted">
            <FolderPlus size={28} className="text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">还没有需求方案</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            创建第一个需求方案后，就可以集中管理 PRD、交互原型和附录说明。
          </p>
          <div className="mt-6">
            {canModify && (
              <ProjectCreateDialog
                label="创建第一个需求方案"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-elev-1 transition-all hover:shadow-elev-2 active:scale-[0.98]"
              />
            )}
          </div>
        </section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {projects.map((project) => {
            const projectDocuments = documentsByProject.get(project.id) ?? [];
            const assetCounts = getAssetCounts(projectDocuments);
            return (
              <article
                key={project.id}
                data-project-card-density="compact"
                className="group relative grid min-h-[184px] grid-cols-[164px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-border bg-card shadow-elev-1 transition-all duration-300 hover:-translate-y-1 hover:shadow-elev-2"
              >
                <Link
                  href={`/solutions/${project.id}`}
                  aria-label={`打开需求方案：${project.name}`}
                  className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {canModify && (
                  <div className="absolute right-2.5 top-2.5 z-20 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <div className="rounded-lg bg-card/85 backdrop-blur-sm shadow-elev-1">
                      <ProjectActions
                        project={{
                          id: project.id,
                          name: project.name,
                          description: project.description,
                          color: project.color,
                        }}
                      />
                    </div>
                  </div>
                )}
                <div className="pointer-events-none relative z-10">
                  <ProjectAssetStack
                    documents={projectDocuments}
                    versionsByDocument={currentVersionsByDocument}
                    projectName={project.name}
                    color={project.color}
                  />
                </div>

                <div className="pointer-events-none relative z-10 flex min-w-0 flex-col p-4 pr-11">
                  <div className="mb-2 flex items-start gap-2">
                    <h2 className="min-w-0 flex-1 truncate text-base font-semibold">
                      {project.name}
                    </h2>
                    <div className="pointer-events-auto">
                      {canModify ? (
                        <ProjectStatusSelect
                          projectId={project.id}
                          projectName={project.name}
                          status={project.status}
                        />
                      ) : (
                        <Badge variant={statusVariants[project.status]} className="shrink-0">
                          {projectStatusLabels[project.status]}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {project.description ? (
                    <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {project.description}
                    </p>
                  ) : (
                    <p className="line-clamp-1 text-sm leading-relaxed text-muted-foreground">
                      暂无描述
                    </p>
                  )}

                  <div className="mt-auto grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 pt-4">
                    <div className="flex flex-wrap gap-1.5 text-[11px] font-medium">
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <FileText size={12} />
                        PRD {assetCounts.prd}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-2 py-1 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                        <FileCode2 size={12} />
                        原型 {assetCounts.prototype}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        <Paperclip size={12} />
                        附录 {assetCounts.appendix}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <Eye size={12} />
                        已读 {readCountsByProject.get(project.id) ?? 0}
                      </span>
                    </div>
                    <time
                      dateTime={project.updatedAt.toISOString()}
                      className="text-right text-xs text-muted-foreground"
                    >
                      更新 {formatDate(project.updatedAt)}
                    </time>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
