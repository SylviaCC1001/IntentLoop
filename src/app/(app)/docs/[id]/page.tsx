import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft, FileCode2, FileText } from "lucide-react";
import { db, schema } from "@/lib/db";
import MarkdownEditor from "@/components/MarkdownEditor";
import MarkdownReviewWorkspace from "@/components/MarkdownReviewWorkspace";
import PrototypeSandbox from "@/components/PrototypeSandbox";
import ResizableJointReviewLayout from "@/components/ResizableJointReviewLayout";
import VersionHistoryPanel from "@/components/VersionHistoryPanel";

const statusLabels: Record<string, string> = {
  draft: "草稿",
  reviewing: "评审中",
  published: "已发布",
  archived: "已归档",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function prototypeSrc(storagePath: string | null | undefined) {
  if (!storagePath) return "";
  const normalized = storagePath.startsWith("prototypes/")
    ? storagePath.slice("prototypes/".length)
    : storagePath;
  return `/proto/${normalized}`;
}

function prototypeModeHref(
  documentId: string,
  mode: "preview" | "review" | "joint",
  versionId?: string | null
) {
  const params = new URLSearchParams();
  params.set("mode", mode);
  if (versionId) {
    params.set("version", versionId);
  }
  const query = params.toString();
  return query ? `/docs/${documentId}?${query}` : `/docs/${documentId}`;
}

function ReviewScopeNav({
  jointHref,
  prdHref,
  prototypeHref,
  active,
}: {
  jointHref?: string | null;
  prdHref?: string | null;
  prototypeHref?: string | null;
  active: "joint" | "prd" | "html";
}) {
  const items = [
    { key: "joint" as const, label: "联合评审", href: jointHref },
    { key: "prd" as const, label: "需求评审", href: prdHref },
    { key: "html" as const, label: "原型评审", href: prototypeHref },
  ];

  return (
    <nav
      data-review-scope-switcher="true"
      className="inline-flex rounded-lg border border-border bg-card p-1"
    >
      {items.map((item) => {
        const className = `rounded-md px-3 py-1.5 text-sm font-medium ${
          active === item.key
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`;
        if (!item.href) {
          return (
            <span
              key={item.key}
              aria-disabled="true"
              className={`${className} cursor-not-allowed opacity-40`}
            >
              {item.label}
            </span>
          );
        }
        return (
          <Link key={item.key} href={item.href} className={className}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function textHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

function lineAnchors(content: string) {
  return content
    .split(/\r?\n/)
    .map((line, index) => ({
      lineNumber: index + 1,
      text: line.trim(),
    }))
    .filter((line) => line.text.length > 0)
    .slice(0, 200)
    .map((line) => ({
      lineNumber: line.lineNumber,
      blockId: `line-${line.lineNumber}`,
      textHash: textHash(line.text),
      preview: line.text.slice(0, 80),
    }));
}

export default async function DocumentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ mode?: string; version?: string }>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const document = db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.id, id))
    .get();

  if (!document) {
    notFound();
  }

  const isPrototypeDocument = document.type === "html" || document.type === "html-zip";
  const mode =
    query.mode === "joint" && isPrototypeDocument
      ? "joint"
      : query.mode === "review"
        ? "review"
        : isPrototypeDocument
          ? "preview"
        : "edit";

  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, document.projectId))
    .get();
  const projectDocuments = db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.projectId, document.projectId))
    .orderBy(desc(schema.documents.updatedAt))
    .all();
  const linkedPrdDocument = isPrototypeDocument
    ? projectDocuments.find((item) => item.type === "md") ?? null
    : document.type === "md"
      ? document
      : null;
  const linkedPrototypeDocument = isPrototypeDocument
    ? document
    : projectDocuments.find((item) => item.type === "html" || item.type === "html-zip") ?? null;
  const linkedPrdVersion = linkedPrdDocument?.currentVersionId
    ? db
        .select()
        .from(schema.versions)
        .where(eq(schema.versions.id, linkedPrdDocument.currentVersionId))
        .get()
    : null;
  const linkedPrdContent = linkedPrdVersion?.content ?? "";
  const currentVersion = document.currentVersionId
    ? db
        .select()
        .from(schema.versions)
        .where(eq(schema.versions.id, document.currentVersionId))
        .get()
    : null;
  const content = currentVersion?.content ?? "";
  const versions = db
    .select()
    .from(schema.versions)
    .where(eq(schema.versions.documentId, document.id))
    .orderBy(desc(schema.versions.createdAt))
    .all();
  const selectedPrototypeVersion =
    document.type !== "md" && query.version
      ? versions.find((version) => version.id === query.version) ?? currentVersion
      : currentVersion;
  const linkedPrototypeVersion = linkedPrototypeDocument?.currentVersionId
    ? db
        .select()
        .from(schema.versions)
        .where(eq(schema.versions.id, linkedPrototypeDocument.currentVersionId))
        .get()
    : null;
  const commentVersion =
    document.type === "md" ? currentVersion : selectedPrototypeVersion;
  const comments = commentVersion
    ? db
        .select()
        .from(schema.comments)
        .where(
          and(
            eq(schema.comments.documentId, document.id),
            eq(schema.comments.versionId, commentVersion.id)
          )
        )
        .orderBy(desc(schema.comments.createdAt))
        .all()
    : [];
  const users = comments.length ? db.select().from(schema.users).all() : [];
  const userMap = Object.fromEntries(
    users.map((user) => [
      user.id,
      { displayName: user.displayName, avatarColor: user.avatarColor },
    ])
  );
  const Icon = document.type === "md" ? FileText : FileCode2;
  const protoSrc = prototypeSrc(selectedPrototypeVersion?.storagePath);
  const scopePrdHref = linkedPrdDocument ? `/docs/${linkedPrdDocument.id}?mode=review` : null;
  const scopePrototypeHref = linkedPrototypeDocument
    ? prototypeModeHref(
        linkedPrototypeDocument.id,
        "review",
        isPrototypeDocument ? selectedPrototypeVersion?.id : linkedPrototypeVersion?.id
      )
    : null;
  const scopeJointHref = linkedPrdDocument && linkedPrototypeDocument
    ? prototypeModeHref(
        linkedPrototypeDocument.id,
        "joint",
        isPrototypeDocument ? selectedPrototypeVersion?.id : linkedPrototypeVersion?.id
      )
    : null;
  const scopeActive =
    document.type === "md" ? "prd" : mode === "joint" ? "joint" : "html";
  const mappedComments = comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    status: comment.status,
    anchorType: comment.anchorType,
    anchorData: comment.anchorData,
    createdAt: comment.createdAt.toISOString(),
    author: userMap[comment.createdBy] ?? null,
  }));
  const openSelectionComments = mappedComments.filter(
    (comment) =>
      comment.status === "open" &&
      comment.anchorData.type === "element" &&
      comment.anchorData.kind === "selection"
  );
  const openPrototypeComments = mappedComments.filter(
    (comment) =>
      comment.status === "open" &&
      comment.anchorData.type === "element" &&
      (comment.anchorData.kind === "prototype-rect" ||
        comment.anchorData.kind === "prototype-element")
  );

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-4">
        <Link
          href={`/solutions/${document.projectId}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
          返回{project ? ` ${project.name}` : "需求方案"}
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Icon size={16} />
              <span>{document.type.toUpperCase()}</span>
              <span>·</span>
              <span>{statusLabels[document.status]}</span>
              <span>·</span>
              <span>{document.priority}</span>
            </div>
            <h1 className="truncate text-2xl font-semibold">{document.title}</h1>
            {document.description && (
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                {document.description}
              </p>
            )}
          </div>
          <div className="shrink-0 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
            更新于 {formatDate(document.updatedAt)}
          </div>
        </div>

        {((document.type === "md" && mode === "review") ||
          (isPrototypeDocument && mode !== "preview")) && (
          <ReviewScopeNav
            jointHref={scopeJointHref}
            prdHref={scopePrdHref}
            prototypeHref={scopePrototypeHref}
            active={scopeActive}
          />
        )}
      </header>

      {document.type === "md" && mode === "edit" && (
        <>
          <MarkdownEditor documentId={document.id} initialContent={content} />
          <VersionHistoryPanel
            documentId={document.id}
            currentVersionId={document.currentVersionId}
            versions={versions.map((version) => ({
              id: version.id,
              message: version.message,
              size: version.size,
              createdAt: version.createdAt.toISOString(),
              isCurrent: version.id === document.currentVersionId,
              hasTextContent: Boolean(version.content),
            }))}
          />
        </>
      )}

      {document.type === "md" && mode === "review" && (
        <MarkdownReviewWorkspace
          documentId={document.id}
          content={content}
          versionId={currentVersion?.id ?? null}
          comments={openSelectionComments}
          lineAnchors={lineAnchors(content)}
        />
      )}

      {isPrototypeDocument && mode === "preview" && (
        <PrototypeSandbox
          documentId={document.id}
          title={document.title}
          mode="preview"
          selectedVersionId={selectedPrototypeVersion?.id ?? null}
          selectedVersionSize={selectedPrototypeVersion?.size ?? null}
          previewUrl={protoSrc}
          previewHtml={selectedPrototypeVersion?.content ?? ""}
          comments={[]}
          defaultCommentPanelOpen={false}
          canSaveHtmlVersion={false}
          versions={versions.map((version) => ({
            id: version.id,
            message: version.message,
            size: version.size,
            createdAt: version.createdAt.toISOString(),
            isCurrent: version.id === document.currentVersionId,
            href: prototypeModeHref(document.id, "preview", version.id),
          }))}
        />
      )}

      {isPrototypeDocument && mode === "review" && (
        <>
          <PrototypeSandbox
            documentId={document.id}
            title={document.title}
            mode="review"
            selectedVersionId={selectedPrototypeVersion?.id ?? null}
            selectedVersionSize={selectedPrototypeVersion?.size ?? null}
            previewUrl={protoSrc}
            previewHtml={selectedPrototypeVersion?.content ?? ""}
            comments={openPrototypeComments}
            canSaveHtmlVersion={document.type === "html"}
            versions={versions.map((version) => ({
              id: version.id,
              message: version.message,
              size: version.size,
              createdAt: version.createdAt.toISOString(),
              isCurrent: version.id === document.currentVersionId,
              href: prototypeModeHref(document.id, "review", version.id),
            }))}
          />
          <VersionHistoryPanel
            documentId={document.id}
            currentVersionId={document.currentVersionId}
            versions={versions.map((version) => ({
              id: version.id,
              message: version.message,
              size: version.size,
              createdAt: version.createdAt.toISOString(),
              isCurrent: version.id === document.currentVersionId,
              hasTextContent: Boolean(version.content),
            }))}
          />
        </>
      )}

      {isPrototypeDocument && mode === "joint" && (
        <ResizableJointReviewLayout
          prdTitle={linkedPrdDocument?.title ?? null}
          prdContent={linkedPrdContent}
        >
          <PrototypeSandbox
            documentId={document.id}
            title={document.title}
            mode="review"
            selectedVersionId={selectedPrototypeVersion?.id ?? null}
            selectedVersionSize={selectedPrototypeVersion?.size ?? null}
            previewUrl={protoSrc}
            previewHtml={selectedPrototypeVersion?.content ?? ""}
            comments={openPrototypeComments}
            defaultCommentPanelOpen={false}
            canSaveHtmlVersion={document.type === "html"}
            versions={versions.map((version) => ({
              id: version.id,
              message: version.message,
              size: version.size,
              createdAt: version.createdAt.toISOString(),
              isCurrent: version.id === document.currentVersionId,
              href: prototypeModeHref(document.id, "joint", version.id),
            }))}
          />
        </ResizableJointReviewLayout>
      )}

      {document.type === "appendix" && (
        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-medium">附录说明</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            附录文件在需求方案详情页聚合展示和下载，不进入原型沙盘。
          </p>
        </section>
      )}
    </div>
  );
}
