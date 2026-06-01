import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { CommentAnchor } from "@/lib/db/schema";
import {
  reviewStatusLabels,
  type ReviewIssueStatus,
  type SolutionReviewIssue,
} from "@/lib/solution-review/types";

export type SolutionReviewData = {
  solution: typeof schema.projects.$inferSelect;
  documents: Array<typeof schema.documents.$inferSelect>;
  versions: Array<typeof schema.versions.$inferSelect>;
  issues: SolutionReviewIssue[];
};

function documentKind(type: string) {
  if (type === "md") return "PRD";
  if (type === "html" || type === "html-zip") return "交互原型";
  return "附录说明";
}

function issueHref(documentId: string, type: string, versionId: string) {
  if (type === "md") {
    return `/docs/${documentId}?mode=review`;
  }
  if (type === "html" || type === "html-zip") {
    return `/docs/${documentId}?version=${versionId}`;
  }
  return `/docs/${documentId}`;
}

function anchorLabel(anchor: CommentAnchor) {
  if (anchor.type === "doc") return "整篇文档";
  if (anchor.type === "block") return anchor.preview || anchor.blockId;
  if (anchor.kind === "selection") {
    return anchor.selectedText || anchor.preview || anchor.blockId || "文字选区";
  }
  if (anchor.kind === "prototype-element") {
    const tag = anchor.domAnchor?.tagName || "元素";
    const text = anchor.domAnchor?.text || anchor.preview;
    return text ? `${tag} · ${text}` : tag;
  }
  if (anchor.kind === "prototype-rect") {
    return anchor.preview || "原型视觉标注";
  }
  return anchor.preview || anchor.selector || "页面元素";
}

export function getSolutionReviewData(solutionId: string): SolutionReviewData | null {
  const solution = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, solutionId))
    .get();
  if (!solution) return null;

  const documents = db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.projectId, solutionId))
    .orderBy(desc(schema.documents.updatedAt))
    .all();
  const documentIds = documents.map((document) => document.id);
  const versions = documentIds.length
    ? db
        .select()
        .from(schema.versions)
        .where(inArray(schema.versions.documentId, documentIds))
        .orderBy(desc(schema.versions.createdAt))
        .all()
    : [];
  const comments = documentIds.length
    ? db
        .select()
        .from(schema.comments)
        .where(inArray(schema.comments.documentId, documentIds))
        .orderBy(desc(schema.comments.createdAt))
        .all()
    : [];
  const users = comments.length ? db.select().from(schema.users).all() : [];
  const documentById = new Map(documents.map((document) => [document.id, document]));
  const versionById = new Map(versions.map((version) => [version.id, version]));
  const userById = new Map(users.map((user) => [user.id, user]));

  const issues = comments.flatMap((comment) => {
    const document = documentById.get(comment.documentId);
    const version = versionById.get(comment.versionId);
    if (!document || !version) return [];
    const author = userById.get(comment.createdBy);
    const status = (comment.status || "open") as ReviewIssueStatus;

    return [
      {
        id: comment.id,
        body: comment.body,
        status,
        documentId: document.id,
        documentTitle: document.title,
        documentType: documentKind(document.type),
        versionId: version.id,
        versionMessage: version.message || "未填写更新说明",
        anchorLabel: anchorLabel(comment.anchorData),
        href: issueHref(document.id, document.type, version.id),
        createdAt: comment.createdAt.toISOString(),
        authorName: author?.displayName || "未知用户",
      },
    ];
  });

  return {
    solution,
    documents,
    versions,
    issues,
  };
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatReviewContextMarkdown(data: SolutionReviewData) {
  const versionsByDocument = new Map<string, typeof data.versions>();
  for (const version of data.versions) {
    versionsByDocument.set(version.documentId, [
      ...(versionsByDocument.get(version.documentId) ?? []),
      version,
    ]);
  }

  const payload = {
    solution: {
      id: data.solution.id,
      name: data.solution.name,
      description: data.solution.description,
      updatedAt: data.solution.updatedAt,
    },
    documents: data.documents.map((document) => ({
      id: document.id,
      title: document.title,
      type: document.type,
      status: document.status,
      currentVersionId: document.currentVersionId,
    })),
    issues: data.issues,
  };

  const lines = [
    "# 需求方案评审上下文",
    "",
    `- 需求方案：${data.solution.name}`,
    `- 更新时间：${formatDate(data.solution.updatedAt)}`,
    data.solution.description ? `- 说明：${data.solution.description}` : "",
    "",
    "## 版本更新说明",
    "",
  ].filter(Boolean);

  for (const document of data.documents) {
    const versions = versionsByDocument.get(document.id) ?? [];
    if (!versions.length) continue;
    lines.push(`### ${documentKind(document.type)}：${document.title}`, "");
    for (const version of versions) {
      lines.push(
        `- ${formatDate(version.createdAt)} · ${version.message || "未填写更新说明"} · ${version.size} bytes`
      );
    }
    lines.push("");
  }

  lines.push("## 评审问题台账", "");
  if (data.issues.length === 0) {
    lines.push("暂无评审问题。", "");
  } else {
    for (const issue of data.issues) {
      lines.push(
        `- [${reviewStatusLabels[issue.status]}] ${issue.documentType} / ${issue.documentTitle} / ${issue.anchorLabel}`,
        `  - 版本：${issue.versionMessage}`,
        `  - 评论：${issue.body}`,
        `  - 作者：${issue.authorName}`,
        `  - 链接：${issue.href}`,
        ""
      );
    }
  }

  lines.push("## 结构化 JSON", "", "```json", JSON.stringify(payload, null, 2), "```", "");
  return lines.join("\n");
}
