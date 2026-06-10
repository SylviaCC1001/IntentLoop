import fs from "fs";
import path from "path";

const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";

async function assertPage(path: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
  });

  if (response.status !== 200 && response.status !== 307) {
    throw new Error(`Expected ${path} to be routable, got ${response.status}`);
  }
}

function getDbPath() {
  return process.env.DATABASE_URL || "./data/prd.db";
}

function assertFloatingActionsRenderThroughPortal() {
  const portalSource = fs.existsSync("src/components/ClientPortal.tsx")
    ? fs.readFileSync("src/components/ClientPortal.tsx", "utf-8")
    : "";
  if (!portalSource.includes("createPortal") || !portalSource.includes("document.body")) {
    throw new Error("Expected floating action dialogs to render through a body portal");
  }

  for (const componentPath of [
    "src/components/ActionsMenu.tsx",
    "src/components/ProjectCreateDialog.tsx",
    "src/components/DocumentCreateDialog.tsx",
  ]) {
    const source = fs.readFileSync(componentPath, "utf-8");
    if (!source.includes("ClientPortal")) {
      throw new Error(`Expected ${componentPath} to keep dialogs outside hover-hidden card chrome`);
    }
  }
}

function fullMarkdownSmokeContent(title: string) {
  return `# ${title}

## 基础语法

普通段落包含 **粗体**、*斜体*、\`行内代码\`、[链接](https://example.com) 和图片：

![示例图片](https://example.com/image.png)

> 这里是一段引用。

- 无序列表
- [x] 已完成任务
- [ ] 未完成任务

1. 有序列表第一项
2. 有序列表第二项

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| title | string | 标题 |
| priority | enum | 优先级 |

## 代码块

\`\`\`ts
type Priority = "P0" | "P1" | "P2" | "P3";
const value: Priority = "P1";
\`\`\`

## 数学公式

行内公式 $E = mc^2$。

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

## Mermaid Flowchart

\`\`\`mermaid
flowchart TD
  A[需求进入] --> B{是否清晰}
  B -->|是| C[写 PRD]
  B -->|否| D[补充调研]
\`\`\`

## Mermaid Sequence

\`\`\`mermaid
sequenceDiagram
  participant U as 用户
  participant S as 系统
  U->>S: 保存文档
  S-->>U: 返回版本号
\`\`\`

## Mermaid Pie

\`\`\`mermaid
pie title 工作量占比
  "PRD" : 40
  "原型" : 35
  "评审" : 25
\`\`\`
`;
}

async function withSmokeSession<T>(
  callback: (cookie: string, db: import("node:sqlite").DatabaseSync) => Promise<T>
) {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(getDbPath());
  const userId = "page-smoke-user";
  const sessionId = "page-smoke-session";

  db.prepare("delete from sessions where id = ?").run(sessionId);
  db.prepare("delete from projects where created_by = ?").run(userId);
  db.prepare("delete from users where id = ?").run(userId);
  db.prepare(
    "insert into users (id, email, password_hash, display_name, avatar_color, role) values (?, ?, ?, ?, ?, ?)"
  ).run(
    userId,
    "page-smoke@example.local",
    "hash",
    "Page Smoke",
    "#6366f1",
    "admin"
  );
  db.prepare("insert into sessions (id, user_id, expires_at) values (?, ?, ?)").run(
    sessionId,
    userId,
    Date.now() + 60_000
  );

  try {
    return await callback(`prd_session=${sessionId}`, db);
  } finally {
    db.prepare("delete from sessions where id = ?").run(sessionId);
    db.prepare("delete from projects where created_by = ?").run(userId);
    db.prepare("delete from users where id = ?").run(userId);
    db.close();
  }
}

async function assertRolePermissionsAndReadTracking() {
  await withSmokeSession(async (_adminCookie, db) => {
    const projectId = "page-smoke-role-project";
    const documentId = "page-smoke-role-document";
    const versionId = "page-smoke-role-version";
    const roles = [
      ["page-smoke-role-admin", "admin", "Role Admin"],
      ["page-smoke-role-product", "product", "Role Product"],
      ["page-smoke-role-engineering", "engineering", "Role Engineering"],
      ["page-smoke-role-design", "design", "Role Design"],
    ] as const;
    const sessions = Object.fromEntries(
      roles.map(([userId]) => [userId, `${userId}-session`])
    );

    function cookieFor(userId: string) {
      return `prd_session=${sessions[userId]}`;
    }

    async function expectStatus(
      response: Response,
      expected: number,
      label: string
    ) {
      if (response.status !== expected) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Expected ${label} to return ${expected}, got ${response.status}: ${body.slice(0, 240)}`
        );
      }
    }

    for (const [, , displayName] of roles) {
      db.prepare("delete from sessions where user_id in (select id from users where display_name = ?)").run(displayName);
    }
    for (const [userId] of roles) {
      db.prepare("delete from sessions where id = ?").run(sessions[userId]);
    }
    db.prepare("delete from versions where document_id = ?").run(documentId);
    db.prepare("delete from comments where document_id = ?").run(documentId);
    db.prepare("delete from documents where project_id = ?").run(projectId);
    db.prepare("delete from projects where id = ?").run(projectId);
    for (const [userId] of roles) {
      db.prepare("delete from projects where created_by = ?").run(userId);
      db.prepare("delete from users where id = ?").run(userId);
    }

    for (const [userId, role, displayName] of roles) {
      db.prepare(
        "insert into users (id, email, password_hash, display_name, avatar_color, role) values (?, ?, ?, ?, ?, ?)"
      ).run(
        userId,
        `${userId}@example.local`,
        "hash",
        displayName,
        "#6366f1",
        role
      );
      db.prepare("insert into sessions (id, user_id, expires_at) values (?, ?, ?)").run(
        sessions[userId],
        userId,
        Date.now() + 60_000
      );
    }

    db.prepare(
      "insert into projects (id, name, description, color, created_by) values (?, ?, ?, ?, ?)"
    ).run(projectId, "Role Permission Smoke", null, "#6366f1", "page-smoke-role-product");
    db.prepare(
      "insert into documents (id, project_id, title, type, status, priority, tags, owner_id, current_version_id, description) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      documentId,
      projectId,
      "Role PRD",
      "md",
      "draft",
      "P1",
      "[]",
      "page-smoke-role-product",
      versionId,
      "Permission document"
    );
    db.prepare(
      "insert into versions (id, document_id, message, content, size, created_by) values (?, ?, ?, ?, ?, ?)"
    ).run(
      versionId,
      documentId,
      "Role PRD version",
      "# Role PRD\n\nEngineering can read and comment.",
      42,
      "page-smoke-role-product"
    );

    try {
      const engineeringCookie = cookieFor("page-smoke-role-engineering");
      const productCookie = cookieFor("page-smoke-role-product");

      await expectStatus(
        await fetch(`${baseUrl}/api/projects`, {
          method: "POST",
          headers: {
            Cookie: engineeringCookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "Engineering Created Project",
            description: "should be rejected",
          }),
        }),
        403,
        "engineering project create"
      );

      await expectStatus(
        await fetch(`${baseUrl}/api/projects/${projectId}`, {
          method: "PATCH",
          headers: {
            Cookie: engineeringCookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Engineering Rename" }),
        }),
        403,
        "engineering project patch"
      );

      const uploadData = new FormData();
      uploadData.set("assetType", "prd");
      uploadData.set("file", new Blob(["# Blocked"], { type: "text/markdown" }), "blocked.md");
      uploadData.set("title", "Blocked PRD");
      await expectStatus(
        await fetch(`${baseUrl}/api/solutions/${projectId}/assets`, {
          method: "POST",
          headers: { Cookie: engineeringCookie },
          body: uploadData,
        }),
        403,
        "engineering solution asset upload"
      );

      await expectStatus(
        await fetch(`${baseUrl}/api/documents/${documentId}/versions`, {
          method: "POST",
          headers: {
            Cookie: engineeringCookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: "# Blocked edit",
            message: "should be rejected",
          }),
        }),
        403,
        "engineering version save"
      );

      await expectStatus(
        await fetch(`${baseUrl}/api/documents/${documentId}/comments`, {
          method: "POST",
          headers: {
            Cookie: engineeringCookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            versionId,
            anchor: { type: "doc" },
            body: "研发可以评论",
          }),
        }),
        201,
        "engineering comment create"
      );

      await expectStatus(
        await fetch(`${baseUrl}/api/projects/${projectId}`, {
          method: "PATCH",
          headers: {
            Cookie: productCookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Role Permission Smoke Updated" }),
        }),
        200,
        "product project patch"
      );

      const pageResponse = await fetch(`${baseUrl}/solutions/${projectId}`, {
        headers: { Cookie: engineeringCookie },
      });
      await expectStatus(pageResponse, 200, "engineering solution page");
      const html = await pageResponse.text();
      for (const text of ["阅读查看情况", "Role Engineering", "Role Product"]) {
        if (!html.includes(text)) {
          throw new Error(`Expected engineering solution page to include ${text}`);
        }
      }
      for (const text of ["上传 PRD", "上传原型", "上传附录"]) {
        if (html.includes(text)) {
          throw new Error(`Expected engineering solution page to hide ${text}`);
        }
      }

      const read = db
        .prepare(
          "select read_count as readCount, last_read_at as lastReadAt from project_reads where project_id = ? and user_id = ?"
        )
        .get(projectId, "page-smoke-role-engineering") as
        | { readCount: number; lastReadAt: number | null }
        | undefined;
      if (!read || read.readCount < 1 || !read.lastReadAt) {
        throw new Error("Expected solution page view to record engineering read status");
      }
    } finally {
      const createdDocuments = db
        .prepare("select id from documents where project_id = ?")
        .all(projectId) as Array<{ id: string }>;
      for (const document of createdDocuments) {
        fs.rmSync(path.join(process.env.DATA_DIR || "./data", "prototypes", document.id), {
          recursive: true,
          force: true,
        });
        fs.rmSync(path.join(process.env.DATA_DIR || "./data", "repos", document.id), {
          recursive: true,
          force: true,
        });
      }
      db.prepare("delete from comments where document_id in (select id from documents where project_id = ?)").run(projectId);
      db.prepare("delete from versions where document_id in (select id from documents where project_id = ?)").run(projectId);
      db.prepare("delete from documents where project_id = ?").run(projectId);
      db.prepare("delete from projects where id = ?").run(projectId);
      for (const [userId] of roles) {
        db.prepare("delete from projects where created_by = ?").run(userId);
        db.prepare("delete from sessions where id = ?").run(sessions[userId]);
        db.prepare("delete from users where id = ?").run(userId);
      }
    }
  });
}

async function assertProjectsCreateEntry() {
  await withSmokeSession(async (cookie, db) => {
    const projectId = "page-smoke-solution-list-project";
    const markdownDocumentId = "page-smoke-solution-list-md";
    const markdownVersionId = "page-smoke-solution-list-md-v1";
    const htmlDocumentId = "page-smoke-solution-list-html";
    const htmlVersionId = "page-smoke-solution-list-html-v1";
    const appendixDocumentId = "page-smoke-solution-list-appendix";
    const appendixVersionId = "page-smoke-solution-list-appendix-v1";
    db.prepare("delete from versions where document_id in (?, ?, ?)").run(
      markdownDocumentId,
      htmlDocumentId,
      appendixDocumentId
    );
    db.prepare("delete from documents where project_id = ?").run(projectId);
    db.prepare("delete from projects where id = ?").run(projectId);
    db.prepare(
      "insert into projects (id, name, description, color, created_by) values (?, ?, ?, ?, ?)"
    ).run(projectId, "Page Smoke Solution", null, "#6366f1", "page-smoke-user");
    db.prepare(
      "insert into documents (id, project_id, title, type, status, priority, tags, owner_id, current_version_id, description) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      markdownDocumentId,
      projectId,
      "Smoke PRD",
      "md",
      "draft",
      "P1",
      "[]",
      "page-smoke-user",
      markdownVersionId,
      "Markdown card thumbnail"
    );
    db.prepare(
      "insert into documents (id, project_id, title, type, status, priority, tags, owner_id, current_version_id, description) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      htmlDocumentId,
      projectId,
      "Smoke Prototype",
      "html",
      "draft",
      "P2",
      "[]",
      "page-smoke-user",
      htmlVersionId,
      "HTML card thumbnail"
    );
    db.prepare(
      "insert into documents (id, project_id, title, type, status, priority, tags, owner_id, current_version_id, description) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      appendixDocumentId,
      projectId,
      "Smoke Appendix",
      "appendix",
      "draft",
      "P3",
      "[]",
      "page-smoke-user",
      appendixVersionId,
      "Appendix card thumbnail"
    );
    db.prepare(
      "insert into versions (id, document_id, message, content, size, created_by) values (?, ?, ?, ?, ?, ?)"
    ).run(
      markdownVersionId,
      markdownDocumentId,
      "PRD content thumbnail",
      "# Plugin Market\n\nInstall flow supports search, permissions and version rollback.",
      72,
      "page-smoke-user"
    );
    db.prepare(
      "insert into versions (id, document_id, message, content, size, created_by) values (?, ?, ?, ?, ?, ?)"
    ).run(
      htmlVersionId,
      htmlDocumentId,
      "HTML content thumbnail",
      "<!doctype html><html><head><title>Prototype Shell</title></head><body><h1>Plugin Market Prototype</h1><p>Install button appears on each card.</p></body></html>",
      148,
      "page-smoke-user"
    );
    db.prepare(
      "insert into versions (id, document_id, message, storage_path, size, created_by) values (?, ?, ?, ?, ?, ?)"
    ).run(
      appendixVersionId,
      appendixDocumentId,
      "Appendix content thumbnail",
      "appendices/page-smoke-solution-list-project/page-smoke-solution-list-appendix/smoke.pdf",
      20,
      "page-smoke-user"
    );

    try {
      const response = await fetch(`${baseUrl}/projects`, {
        headers: { Cookie: cookie },
      });
      if (response.status !== 200) {
        throw new Error(`Expected /projects with smoke session to return 200, got ${response.status}`);
      }

      const html = await response.text();
      if (!html.includes("需求方案") || !html.includes("新建需求方案")) {
        throw new Error("Expected /projects to render demand solution entry");
      }
      if (
        !html.includes("data-app-sidebar-collapsible") ||
        !html.includes('aria-label="收起导航"')
      ) {
        throw new Error("Expected app sidebar to expose a collapse control");
      }
      if (html.includes("全部文档")) {
        throw new Error("Expected app navigation to avoid the all-documents tab");
      }
      if (!html.includes(`/solutions/${projectId}`)) {
        throw new Error("Expected /projects solution cards to link to solution detail");
      }
      if (!html.includes('data-project-card-density="compact"')) {
        throw new Error("Expected /projects to render compact project cards");
      }
      if (html.includes("个资产")) {
        throw new Error("Expected project cards to avoid redundant asset total copy");
      }
      for (const kind of ["md", "html", "appendix"]) {
        if (!html.includes(`data-project-asset-kind="${kind}"`)) {
          throw new Error(`Expected project card stack to render ${kind} asset thumbnail`);
        }
      }
      for (const text of [
        "Plugin Market",
        "Install flow",
        "Plugin Market Prototype",
        "Install button",
      ]) {
        if (!html.includes(text)) {
          throw new Error(`Expected project card thumbnail to include real content: ${text}`);
        }
      }
      if (html.includes("disabled=\"\"")) {
        throw new Error("Expected create project entry to be enabled");
      }
    } finally {
      db.prepare("delete from versions where document_id in (?, ?, ?)").run(
        markdownDocumentId,
        htmlDocumentId,
        appendixDocumentId
      );
      db.prepare("delete from documents where project_id = ?").run(projectId);
      db.prepare("delete from projects where id = ?").run(projectId);
    }
  });
}

async function postSolutionAsset(
  cookie: string,
  fields: {
    solutionId: string;
    assetType: "prd" | "prototype" | "appendix";
    filename: string;
    file: Blob;
    title?: string;
    message?: string;
  }
) {
  const formData = new FormData();
  formData.set("assetType", fields.assetType);
  formData.set("file", fields.file, fields.filename);
  if (fields.title) formData.set("title", fields.title);
  if (fields.message) formData.set("message", fields.message);

  const response = await fetch(`${baseUrl}/api/solutions/${fields.solutionId}/assets`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: formData,
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function assertSolutionAssetStructure() {
  await withSmokeSession(async (cookie, db) => {
    const projectId = "page-smoke-solution-assets";
    const dataDir = process.env.DATA_DIR || "./data";
    db.prepare("delete from projects where id = ?").run(projectId);
    db.prepare(
      "insert into projects (id, name, description, color, created_by) values (?, ?, ?, ?, ?)"
    ).run(
      projectId,
      "Page Smoke Requirement Solution",
      "需求方案结构 smoke",
      "#6366f1",
      "page-smoke-user"
    );

    try {
      const emptyResponse = await fetch(`${baseUrl}/solutions/${projectId}`, {
        headers: { Cookie: cookie },
      });
      if (emptyResponse.status !== 200) {
        throw new Error(`Expected /solutions/[id] to return 200, got ${emptyResponse.status}`);
      }
      const emptyHtml = await emptyResponse.text();
      for (const text of [
        "需求方案",
        "评审",
        "PRD",
        "交互原型",
        "附录说明",
        "上传 PRD",
        "上传原型",
        "上传附录",
      ]) {
        if (!emptyHtml.includes(text)) {
          throw new Error(`Expected solution detail to include ${text}`);
        }
      }
      for (const marker of [
        'data-solution-detail-layout="workspace"',
        'data-solution-review-entry="header"',
        'data-solution-asset-rail="primary"',
        'data-solution-appendix-list="compact"',
      ]) {
        if (!emptyHtml.includes(marker)) {
          throw new Error(`Expected solution detail workspace layout marker ${marker}`);
        }
      }
      if (emptyHtml.includes("项目")) {
        throw new Error("Expected solution detail to avoid project wording");
      }

      const prototypeOnly = await postSolutionAsset(cookie, {
        solutionId: projectId,
        assetType: "prototype",
        filename: "prototype-only.html",
        title: "仅原型",
        message: "仅上传原型",
        file: new Blob(["<!doctype html><h1>Prototype Only</h1>"], { type: "text/html" }),
      });
      if (prototypeOnly.response.status !== 201 || !prototypeOnly.body.document?.id) {
        throw new Error(
          `Expected prototype-only upload to create asset, got ${prototypeOnly.response.status}: ${JSON.stringify(prototypeOnly.body)}`
        );
      }
      const prototypeOnlyDocumentId = prototypeOnly.body.document.id;
      const prototypeOnlyVersionId = prototypeOnly.body.document.currentVersionId;
      const prototypeOnlyResponse = await fetch(`${baseUrl}/solutions/${projectId}`, {
        headers: { Cookie: cookie },
      });
      const prototypeOnlyHtml = await prototypeOnlyResponse.text();
      for (const text of [
        "Prototype Only",
        "mode=joint",
        `version=${prototypeOnlyVersionId}`,
      ]) {
        if (!prototypeOnlyHtml.includes(text)) {
          throw new Error(`Expected prototype-only solution detail to include ${text}`);
        }
      }

      const prototypeOnlyJointResponse = await fetch(
        `${baseUrl}/docs/${prototypeOnlyDocumentId}?mode=joint&version=${prototypeOnlyVersionId}`,
        { headers: { Cookie: cookie } }
      );
      if (prototypeOnlyJointResponse.status !== 200) {
        throw new Error(
          `Expected prototype-only joint review to return 200, got ${prototypeOnlyJointResponse.status}`
        );
      }
      const prototypeOnlyJointHtml = await prototypeOnlyJointResponse.text();
      for (const text of ["PRD 对照", "当前需求方案下还没有 PRD 文档。", "Prototype Only"]) {
        if (!prototypeOnlyJointHtml.includes(text)) {
          throw new Error(`Expected prototype-only joint review to include ${text}`);
        }
      }

      const prdV1 = await postSolutionAsset(cookie, {
        solutionId: projectId,
        assetType: "prd",
        filename: "prd-v1.md",
        title: "需求 PRD",
        message: "PRD v1",
        file: new Blob(["# PRD V1"], { type: "text/markdown" }),
      });
      if (prdV1.response.status !== 201 || !prdV1.body.document?.id) {
        throw new Error(`Expected PRD upload to create asset, got ${prdV1.response.status}: ${JSON.stringify(prdV1.body)}`);
      }
      const prdV1Id = prdV1.body.document.currentVersionId;

      const prdV2 = await postSolutionAsset(cookie, {
        solutionId: projectId,
        assetType: "prd",
        filename: "prd-v2.md",
        title: "需求 PRD",
        message: "PRD v2",
        file: new Blob(["# PRD V2"], { type: "text/markdown" }),
      });
      if (prdV2.response.status !== 201 || prdV2.body.document?.id !== prdV1.body.document.id) {
        throw new Error("Expected repeated PRD upload to create a new version on the same asset");
      }
      const prdV2Id = prdV2.body.document.currentVersionId;

      const prdDocCount = db
        .prepare("select count(*) as count from documents where project_id = ? and type = 'md'")
        .get(projectId) as { count: number };
      if (prdDocCount.count !== 1) {
        throw new Error("Expected demand solution to keep a single PRD asset");
      }
      const prdVersionCount = db
        .prepare("select count(*) as count from versions where document_id = ?")
        .get(prdV1.body.document.id) as { count: number };
      if (prdVersionCount.count !== 2) {
        throw new Error("Expected repeated PRD upload to preserve both versions");
      }

      const protoV1 = await postSolutionAsset(cookie, {
        solutionId: projectId,
        assetType: "prototype",
        filename: "prototype-v1.html",
        title: "交互原型",
        message: "原型 v1",
        file: new Blob(["<!doctype html><h1>Prototype V1</h1>"], { type: "text/html" }),
      });
      const protoV2 = await postSolutionAsset(cookie, {
        solutionId: projectId,
        assetType: "prototype",
        filename: "prototype-v2.html",
        title: "交互原型",
        message: "原型 v2",
        file: new Blob(["<!doctype html><h1>Prototype V2</h1>"], { type: "text/html" }),
      });
      if (
        protoV1.response.status !== 201 ||
        protoV2.response.status !== 201 ||
        protoV2.body.document?.id !== protoV1.body.document.id
      ) {
        throw new Error("Expected repeated prototype upload to version the same asset");
      }
      const protoV1Id = protoV1.body.document.currentVersionId;
      const protoV2Id = protoV2.body.document.currentVersionId;

      const appendixOne = await postSolutionAsset(cookie, {
        solutionId: projectId,
        assetType: "appendix",
        filename: "appendix-one.pdf",
        title: "附件一",
        file: new Blob(["fake pdf"], { type: "application/pdf" }),
      });
      const appendixTwo = await postSolutionAsset(cookie, {
        solutionId: projectId,
        assetType: "appendix",
        filename: "appendix-two.xlsx",
        title: "附件二",
        file: new Blob(["fake excel"], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      });
      if (appendixOne.response.status !== 201 || appendixTwo.response.status !== 201) {
        throw new Error("Expected appendix uploads to create attachment assets");
      }
      const appendixDocCount = db
        .prepare("select count(*) as count from documents where project_id = ? and type = 'appendix'")
        .get(projectId) as { count: number };
      if (appendixDocCount.count !== 2) {
        throw new Error("Expected appendix uploads to create separate non-versioned attachments");
      }

      const filledResponse = await fetch(`${baseUrl}/solutions/${projectId}`, {
        headers: { Cookie: cookie },
      });
      const filledHtml = await filledResponse.text();
      for (const text of [
        "PRD V2",
        "Prototype V2",
        "附件一",
        "附件二",
        "版本历史",
        "编辑",
        "预览",
        "mode=joint",
        "mode=preview",
        `version=${protoV2Id}`,
        `/api/documents/${prdV2.body.document.id}/versions/${prdV2Id}/download`,
        `/api/documents/${protoV2.body.document.id}/versions/${protoV2Id}/download`,
      ]) {
        if (!filledHtml.includes(text)) {
          throw new Error(`Expected filled solution detail to include ${text}`);
        }
      }
      const switchedResponse = await fetch(
        `${baseUrl}/solutions/${projectId}?prdVersion=${prdV1Id}&prototypeVersion=${protoV1Id}`,
        { headers: { Cookie: cookie } }
      );
      if (switchedResponse.status !== 200) {
        throw new Error(`Expected selected solution versions to return 200, got ${switchedResponse.status}`);
      }
      const switchedHtml = await switchedResponse.text();
      for (const text of ["PRD V1", "Prototype V1"]) {
        if (!switchedHtml.includes(text)) {
          throw new Error(`Expected selected solution version content to include ${text}`);
        }
      }
      for (const text of ["PRD V2", "Prototype V2"]) {
        if (switchedHtml.includes(text)) {
          throw new Error(`Expected selected solution version preview to switch away from ${text}`);
        }
      }
      const prdExportResponse = await fetch(
        `${baseUrl}/api/documents/${prdV2.body.document.id}/versions/${prdV2Id}/download`,
        { headers: { Cookie: cookie } }
      );
      if (prdExportResponse.status !== 200) {
        throw new Error(`Expected PRD export to return 200, got ${prdExportResponse.status}`);
      }
      if (!prdExportResponse.headers.get("content-disposition")?.includes(".md")) {
        throw new Error("Expected PRD export to download a markdown file");
      }
      if (!(await prdExportResponse.text()).includes("PRD V2")) {
        throw new Error("Expected PRD export to include current markdown content");
      }
      const prototypeExportResponse = await fetch(
        `${baseUrl}/api/documents/${protoV2.body.document.id}/versions/${protoV2Id}/download`,
        { headers: { Cookie: cookie } }
      );
      if (prototypeExportResponse.status !== 200) {
        throw new Error(`Expected prototype export to return 200, got ${prototypeExportResponse.status}`);
      }
      if (!prototypeExportResponse.headers.get("content-disposition")?.includes(".html")) {
        throw new Error("Expected prototype export to download an HTML file");
      }
      if (!(await prototypeExportResponse.text()).includes("Prototype V2")) {
        throw new Error("Expected prototype export to include current HTML content");
      }
      for (const text of ["编辑 PRD", "查看原型"]) {
        if (filledHtml.includes(text)) {
          throw new Error(`Expected solution detail to remove legacy asset action text: ${text}`);
        }
      }
      for (const marker of [
        'data-solution-render-preview="md"',
        'data-solution-render-preview="html"',
        'data-solution-prototype-frame="true"',
        'data-solution-asset-card="md"',
        'data-solution-asset-card="html"',
        'data-solution-asset-footer-actions="md"',
        'data-solution-asset-footer-actions="html"',
      ]) {
        if (!filledHtml.includes(marker)) {
          throw new Error(`Expected filled solution detail to include rendered preview marker ${marker}`);
        }
      }
      if (
        !filledHtml.includes(
          `/proto/${protoV2.body.document.id}/${protoV2.body.document.currentVersionId}/index.html`
        )
      ) {
        throw new Error("Expected solution detail prototype card to render the live prototype iframe");
      }
      if (!filledHtml.includes(`/api/appendices/${appendixOne.body.document.id}/download`)) {
        throw new Error("Expected appendix cards to expose a download link");
      }
    } finally {
      const documents = db
        .prepare("select id from documents where project_id = ?")
        .all(projectId) as { id: string }[];
      for (const document of documents) {
        fs.rmSync(path.join(dataDir, "prototypes", document.id), {
          recursive: true,
          force: true,
        });
        fs.rmSync(path.join(dataDir, "appendices", projectId, document.id), {
          recursive: true,
          force: true,
        });
      }
      db.prepare("delete from versions where document_id in (select id from documents where project_id = ?)").run(projectId);
      db.prepare("delete from documents where project_id = ?").run(projectId);
      db.prepare("delete from projects where id = ?").run(projectId);
    }
  });
}

async function assertSolutionReviewWorkflow() {
  await withSmokeSession(async (cookie, db) => {
    const projectId = "page-smoke-review-workflow";
    const prdDocumentId = "page-smoke-review-prd";
    const prototypeDocumentId = "page-smoke-review-prototype";
    const prdVersionId = "page-smoke-review-prd-v1";
    const prototypeVersionId = "page-smoke-review-prototype-v1";
    const openCommentId = "page-smoke-review-open";
    const handledCommentId = "page-smoke-review-handled";
    const closedCommentId = "page-smoke-review-closed";
    const dataDir = process.env.DATA_DIR || "./data";
    const prototypeRoot = path.join(dataDir, "prototypes", prototypeDocumentId);
    const prototypeStoragePath = path.posix.join(
      prototypeDocumentId,
      prototypeVersionId,
      "index.html"
    );

    db.prepare("delete from comments where document_id in (?, ?)").run(
      prdDocumentId,
      prototypeDocumentId
    );
    db.prepare("delete from versions where document_id in (?, ?)").run(
      prdDocumentId,
      prototypeDocumentId
    );
    db.prepare("delete from documents where id in (?, ?)").run(
      prdDocumentId,
      prototypeDocumentId
    );
    db.prepare("delete from projects where id = ?").run(projectId);
    fs.rmSync(prototypeRoot, { recursive: true, force: true });

    db.prepare(
      "insert into projects (id, name, description, color, created_by) values (?, ?, ?, ?, ?)"
    ).run(
      projectId,
      "Page Smoke Review Workflow",
      "Review workflow smoke",
      "#0f766e",
      "page-smoke-user"
    );
    db.prepare(
      "insert into documents (id, project_id, title, type, status, priority, tags, owner_id, current_version_id, description) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      prdDocumentId,
      projectId,
      "Review PRD",
      "md",
      "reviewing",
      "P1",
      "[]",
      "page-smoke-user",
      prdVersionId,
      "PRD under review"
    );
    db.prepare(
      "insert into documents (id, project_id, title, type, status, priority, tags, owner_id, current_version_id, description) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      prototypeDocumentId,
      projectId,
      "Review Prototype",
      "html",
      "reviewing",
      "P1",
      "[]",
      "page-smoke-user",
      prototypeVersionId,
      "Prototype under review"
    );

    fs.mkdirSync(path.join(prototypeRoot, prototypeVersionId), { recursive: true });
    fs.writeFileSync(
      path.join(prototypeRoot, prototypeVersionId, "index.html"),
      "<!doctype html><title>Review Prototype</title><button id=\"pay\">Pay</button>",
      "utf-8"
    );
    db.prepare(
      "insert into versions (id, document_id, commit_sha, message, content, storage_path, size, created_by) values (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      prdVersionId,
      prdDocumentId,
      "review-prd-sha",
      "PRD 明确结算边界",
      "# Review PRD\n\n结算边界说明",
      null,
      32,
      "page-smoke-user"
    );
    db.prepare(
      "insert into versions (id, document_id, commit_sha, message, content, storage_path, size, created_by) values (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      prototypeVersionId,
      prototypeDocumentId,
      "review-prototype-sha",
      "原型补充支付按钮",
      "<!doctype html><title>Review Prototype</title>",
      prototypeStoragePath,
      78,
      "page-smoke-user"
    );
    db.prepare(
      "insert into comments (id, document_id, version_id, anchor_type, anchor_data, body, status, created_by) values (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      openCommentId,
      prdDocumentId,
      prdVersionId,
      "element",
      JSON.stringify({
        type: "element",
        kind: "selection",
        selector: '[data-comment-anchor="line-3"]',
        blockId: "line-3",
        textHash: "review-prd-hash",
        selectedText: "结算边界",
        startOffset: 0,
        endOffset: 4,
        preview: "结算边界",
      }),
      "PRD 需要补充失败态",
      "open",
      "page-smoke-user"
    );
    db.prepare(
      "insert into comments (id, document_id, version_id, anchor_type, anchor_data, body, status, created_by) values (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      handledCommentId,
      prototypeDocumentId,
      prototypeVersionId,
      "element",
      JSON.stringify({
        type: "element",
        kind: "prototype-element",
        selector: "button#pay",
        textHash: "button#pay|Pay",
        preview: "button · Pay",
        pagePath: `/proto/${prototypeStoragePath}`,
        viewport: { w: 1366, h: 768 },
        bbox: { x: 10, y: 20, w: 8, h: 4 },
        domAnchor: {
          selector: "button#pay",
          xpath: "/html/body/button[1]",
          tagName: "button",
          id: "pay",
          text: "Pay",
          fingerprint: "button#pay|Pay",
        },
      }),
      "原型按钮文案已调整",
      "handled",
      "page-smoke-user"
    );
    db.prepare(
      "insert into comments (id, document_id, version_id, anchor_type, anchor_data, body, status, created_by) values (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      closedCommentId,
      prdDocumentId,
      prdVersionId,
      "doc",
      JSON.stringify({ type: "doc" }),
      "这条讨论已关闭",
      "closed",
      "page-smoke-user"
    );

    try {
      const pageResponse = await fetch(`${baseUrl}/solutions/${projectId}`, {
        headers: { Cookie: cookie },
      });
      if (pageResponse.status !== 200) {
        throw new Error(`Expected review workflow solution page to return 200, got ${pageResponse.status}`);
      }
      const html = await pageResponse.text();
      for (const marker of [
        "评审问题台账",
        "data-review-issue-ledger",
        "待处理",
        "导出评审上下文",
      ]) {
        if (!html.includes(marker)) {
          throw new Error(`Expected review workflow page to include ${marker}`);
        }
      }
      if (html.includes('data-review-issue-ledger="summary"')) {
        throw new Error("Expected solution detail to avoid a flat review issue ledger");
      }

      const patchResponse = await fetch(`${baseUrl}/api/comments/${openCommentId}`, {
        method: "PATCH",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "handled" }),
      });
      const patchBody = await patchResponse.json().catch(() => ({}));
      if (patchResponse.status !== 200 || patchBody.comment?.status !== "handled") {
        throw new Error(
          `Expected comment status to support handled, got ${patchResponse.status}: ${JSON.stringify(patchBody)}`
        );
      }

      const exportResponse = await fetch(
        `${baseUrl}/api/solutions/${projectId}/review-context`,
        { headers: { Cookie: cookie } }
      );
      if (exportResponse.status !== 200) {
        throw new Error(`Expected review context export to return 200, got ${exportResponse.status}`);
      }
      const contentType = exportResponse.headers.get("content-type") || "";
      if (!contentType.includes("text/markdown")) {
        throw new Error("Expected review context export to be Markdown");
      }
      const markdown = await exportResponse.text();
      for (const marker of [
        "# 需求方案评审上下文",
        "Page Smoke Review Workflow",
        "## 版本更新说明",
        "PRD 明确结算边界",
        "原型补充支付按钮",
        "## 评审问题台账",
        "PRD 需要补充失败态",
        "原型按钮文案已调整",
        "```json",
      ]) {
        if (!markdown.includes(marker)) {
          throw new Error(`Expected review context export to include ${marker}`);
        }
      }
    } finally {
      db.prepare("delete from comments where document_id in (?, ?)").run(
        prdDocumentId,
        prototypeDocumentId
      );
      db.prepare("delete from versions where document_id in (?, ?)").run(
        prdDocumentId,
        prototypeDocumentId
      );
      db.prepare("delete from documents where id in (?, ?)").run(
        prdDocumentId,
        prototypeDocumentId
      );
      db.prepare("delete from projects where id = ?").run(projectId);
      fs.rmSync(prototypeRoot, { recursive: true, force: true });
    }
  });
}

async function assertDocumentsCreateEntry() {
  await withSmokeSession(async (cookie, db) => {
    const projectId = "page-smoke-project";
    db.prepare("delete from projects where id = ?").run(projectId);
    db.prepare(
      "insert into projects (id, name, description, color, created_by) values (?, ?, ?, ?, ?)"
    ).run(projectId, "Page Smoke Project", null, "#6366f1", "page-smoke-user");

    try {
      const response = await fetch(`${baseUrl}/docs?project=${projectId}`, {
        headers: { Cookie: cookie },
      });
      if (response.status !== 200) {
        throw new Error(
          `Expected /docs?project with smoke session to return 200, got ${response.status}`
        );
      }

      const html = await response.text();
      if (!html.includes("新建文档")) {
        throw new Error("Expected /docs?project to render create document entry");
      }
      if (!html.includes("导入文件")) {
        throw new Error("Expected /docs?project to render import document entry");
      }
      if (html.includes("disabled=\"\"")) {
        throw new Error("Expected create document entry to be enabled");
      }
    } finally {
      db.prepare("delete from projects where id = ?").run(projectId);
    }
  });
}

async function assertDocumentDetailPage() {
  await withSmokeSession(async (cookie, db) => {
    const projectId = "page-smoke-detail-project";
    const documentId = "page-smoke-document";
    const versionId = "page-smoke-version";
    const previousVersionId = "page-smoke-previous-version";
    const commentId = "page-smoke-comment";
    const resolvedCommentId = "page-smoke-resolved-comment";
    const title = "Page Smoke Document";
    const content = fullMarkdownSmokeContent(title);

    db.prepare("delete from comments where id = ?").run(commentId);
    db.prepare("delete from comments where id = ?").run(resolvedCommentId);
    db.prepare("delete from versions where id = ?").run(previousVersionId);
    db.prepare("delete from versions where id = ?").run(versionId);
    db.prepare("delete from documents where id = ?").run(documentId);
    db.prepare("delete from projects where id = ?").run(projectId);
    db.prepare(
      "insert into projects (id, name, description, color, created_by) values (?, ?, ?, ?, ?)"
    ).run(projectId, "Page Smoke Detail Project", null, "#6366f1", "page-smoke-user");
    db.prepare(
      "insert into documents (id, project_id, title, type, status, priority, tags, owner_id, current_version_id, description) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      documentId,
      projectId,
      title,
      "md",
      "draft",
      "P2",
      "[]",
      "page-smoke-user",
      versionId,
      "Smoke detail"
    );
    db.prepare(
      "insert into versions (id, document_id, commit_sha, message, content, size, created_by) values (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      previousVersionId,
      documentId,
      "smoke-previous-sha",
      "上一版 smoke",
      "# Previous Smoke",
      Buffer.byteLength("# Previous Smoke", "utf-8"),
      "page-smoke-user"
    );
    db.prepare(
      "insert into versions (id, document_id, commit_sha, message, content, size, created_by) values (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      versionId,
      documentId,
      "smoke-sha",
      "当前 smoke 版本",
      content,
      Buffer.byteLength(content, "utf-8"),
      "page-smoke-user"
    );
    db.prepare(
      "insert into comments (id, document_id, version_id, anchor_type, anchor_data, body, status, created_by) values (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      commentId,
      documentId,
      versionId,
      "element",
      JSON.stringify({
        type: "element",
        kind: "selection",
        selector: '[data-comment-anchor="line-3"]',
        blockId: "line-3",
        textHash: "smoke-line-hash",
        selectedText: "基础语法",
        startOffset: 0,
        endOffset: 4,
        preview: "基础语法",
      }),
      "这里需要补充评审意见",
      "open",
      "page-smoke-user"
    );
    db.prepare(
      "insert into comments (id, document_id, version_id, anchor_type, anchor_data, body, status, created_by) values (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      resolvedCommentId,
      documentId,
      versionId,
      "element",
      JSON.stringify({
        type: "element",
        kind: "selection",
        selector: '[data-comment-anchor="line-5"]',
        blockId: "line-5",
        textHash: "smoke-resolved-hash",
        selectedText: "不应保留高亮",
        startOffset: 0,
        endOffset: 6,
        preview: "不应保留高亮",
      }),
      "这个问题已解决",
      "resolved",
      "page-smoke-user"
    );

    try {
      const editResponse = await fetch(`${baseUrl}/docs/${documentId}?mode=edit`, {
        headers: { Cookie: cookie },
      });
      if (editResponse.status !== 200) {
        throw new Error(
          `Expected /docs/[id]?mode=edit with smoke document to return 200, got ${editResponse.status}`
        );
      }

      const editHtml = await editResponse.text();
      if (!editHtml.includes(title)) {
        throw new Error("Expected edit mode to render document title");
      }
      if (!editHtml.includes(`/solutions/${projectId}`)) {
        throw new Error("Expected document detail back link to return to solution detail");
      }
      if (editHtml.includes(`/docs?project=${projectId}`)) {
        throw new Error("Expected document detail to avoid returning to the documents list");
      }
      if (!editHtml.includes("发版")) {
        throw new Error("Expected edit mode to render markdown publish action");
      }
      if (editHtml.includes("保存版本")) {
        throw new Error("Expected edit mode to avoid auto-save version wording");
      }
      if (!editHtml.includes("Markdown 编辑")) {
        throw new Error("Expected edit mode to render markdown editor");
      }
      if (!editHtml.includes("实时预览")) {
        throw new Error("Expected edit mode to render live preview");
      }
      if (!editHtml.includes("<table>")) {
        throw new Error("Expected edit mode to render GFM table");
      }
      if (!editHtml.includes("type=\"checkbox\"")) {
        throw new Error("Expected edit mode to render task list checkboxes");
      }
      if (!editHtml.includes("class=\"katex")) {
        throw new Error("Expected edit mode to render KaTeX math");
      }
      if (!editHtml.includes("hljs")) {
        throw new Error("Expected edit mode to render highlighted code");
      }
      if (!editHtml.includes("data-mermaid-diagram=\"true\"")) {
        throw new Error("Expected edit mode to render Mermaid diagram container");
      }
      if (!editHtml.includes("版本历史")) {
        throw new Error("Expected edit mode to render version history panel");
      }
      if (!editHtml.includes("当前 smoke 版本") || !editHtml.includes("上一版 smoke")) {
        throw new Error("Expected edit mode to render version messages");
      }
      if (!editHtml.includes("当前版本")) {
        throw new Error("Expected edit mode to mark current version");
      }
      if (editHtml.includes("评审评论")) {
        throw new Error("Expected edit mode to hide review comments panel");
      }
      if (editHtml.includes(`/docs/${documentId}?mode=review`)) {
        throw new Error("Expected edit mode to avoid an inline switch into PRD review");
      }

      const reviewResponse = await fetch(`${baseUrl}/docs/${documentId}?mode=review`, {
        headers: { Cookie: cookie },
      });
      if (reviewResponse.status !== 200) {
        throw new Error(
          `Expected /docs/[id]?mode=review with smoke document to return 200, got ${reviewResponse.status}`
        );
      }

      const reviewHtml = await reviewResponse.text();
      if (!reviewHtml.includes("评审预览")) {
        throw new Error("Expected review mode to render review preview surface");
      }
      if (!reviewHtml.includes('data-review-scope-switcher="true"')) {
        throw new Error("Expected review mode to render review scope switching");
      }
      if (!reviewHtml.includes("需求评审")) {
        throw new Error("Expected review mode to expose the PRD review scope");
      }
      if (reviewHtml.includes(`/docs/${documentId}?mode=edit`)) {
        throw new Error("Expected PRD review mode to avoid an inline switch back to editing");
      }
      if (reviewHtml.includes("id=\"markdown-editor\"")) {
        throw new Error("Expected review mode to hide markdown editor textarea");
      }
      if (reviewHtml.includes("Markdown 编辑")) {
        throw new Error("Expected review mode to hide edit workspace");
      }
      if (!reviewHtml.includes("评论（")) {
        throw new Error("Expected review mode to render Feishu-style comments title");
      }
      if (!reviewHtml.includes("这里需要补充评审意见")) {
        throw new Error("Expected review mode to render existing comment body");
      }
      if (reviewHtml.includes("回复")) {
        throw new Error("Expected review mode to remove reply input from comment cards");
      }
      if (
        reviewHtml.includes("评审评论") ||
        reviewHtml.includes("评论内容") ||
        reviewHtml.includes("提交评论")
      ) {
        throw new Error("Expected review mode to avoid heavy comment form wording");
      }
      if (reviewHtml.includes("这个问题已解决")) {
        throw new Error("Expected review mode to hide resolved comments from the panel");
      }
      if (!reviewHtml.includes("基础语法")) {
        throw new Error("Expected review mode to render selection comment preview");
      }
      if (reviewHtml.includes("添加整篇评论") || reviewHtml.includes("评论目标")) {
        throw new Error("Expected review mode to remove whole-document comment target controls");
      }
      if (!reviewHtml.includes("收起注释")) {
        throw new Error("Expected review mode comments sidebar to be collapsible");
      }
      if (!reviewHtml.includes("选中文档内容后添加注释")) {
        throw new Error("Expected review mode to guide selection-based comments");
      }
      if (!reviewHtml.includes("选中文字后添加注释")) {
        throw new Error("Expected review mode to explain text-selection comments");
      }
      if (!reviewHtml.includes("data-comment-anchor=")) {
        throw new Error("Expected review mode preview to expose commentable content anchors");
      }
      if (!reviewHtml.includes("data-selection-comment-root=")) {
        throw new Error("Expected review mode preview to expose text-selection comment root");
      }
      if (reviewHtml.includes("aria-label=\"评论:")) {
        throw new Error("Expected review mode to avoid permanent per-block comment buttons");
      }
      if (!reviewHtml.includes(`data-comment-id="${commentId}"`)) {
        throw new Error("Expected open selection comments to render a document marker");
      }
      if (reviewHtml.includes(`data-comment-id="${resolvedCommentId}"`)) {
        throw new Error("Expected resolved selection comments to remove document marker");
      }
      if (reviewHtml.includes("锚点行")) {
        throw new Error("Expected review mode to avoid separate line selector for comments");
      }
    } finally {
      db.prepare("delete from comments where id = ?").run(commentId);
      db.prepare("delete from comments where id = ?").run(resolvedCommentId);
      db.prepare("delete from versions where id = ?").run(previousVersionId);
      db.prepare("delete from versions where id = ?").run(versionId);
      db.prepare("delete from documents where id = ?").run(documentId);
      db.prepare("delete from projects where id = ?").run(projectId);
    }
  });
}

async function assertDocumentVersionSave() {
  await withSmokeSession(async (cookie, db) => {
    const projectId = "page-smoke-save-project";
    const documentId = "page-smoke-save-document";
    const versionId = "page-smoke-save-version";
    const nextContent = `# Saved Smoke\n\n${Date.now()}`;

    db.prepare("delete from versions where document_id = ?").run(documentId);
    db.prepare("delete from documents where id = ?").run(documentId);
    db.prepare("delete from projects where id = ?").run(projectId);
    db.prepare(
      "insert into projects (id, name, description, color, created_by) values (?, ?, ?, ?, ?)"
    ).run(projectId, "Page Smoke Save Project", null, "#6366f1", "page-smoke-user");
    db.prepare(
      "insert into documents (id, project_id, title, type, status, priority, tags, owner_id, current_version_id, description) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      documentId,
      projectId,
      "Page Smoke Save Document",
      "md",
      "draft",
      "P2",
      "[]",
      "page-smoke-user",
      versionId,
      "Smoke save"
    );
    db.prepare(
      "insert into versions (id, document_id, commit_sha, message, content, size, created_by) values (?, ?, ?, ?, ?, ?, ?)"
    ).run(versionId, documentId, "smoke-sha", "初始版本", "# Before", 8, "page-smoke-user");

    try {
      const response = await fetch(`${baseUrl}/api/documents/${documentId}/versions`, {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: nextContent,
          message: "页面 smoke 保存",
        }),
      });
      if (response.status !== 201) {
        throw new Error(`Expected version save API to return 201, got ${response.status}`);
      }

      const document = db
        .prepare("select current_version_id from documents where id = ?")
        .get(documentId) as { current_version_id: string };
      if (document.current_version_id === versionId) {
        throw new Error("Expected version save API to update current_version_id");
      }

      const saved = db
        .prepare("select content from versions where id = ?")
        .get(document.current_version_id) as { content: string };
      if (saved.content !== nextContent) {
        throw new Error("Expected version save API to persist new content");
      }
    } finally {
      db.prepare("delete from versions where document_id = ?").run(documentId);
      db.prepare("delete from documents where id = ?").run(documentId);
      db.prepare("delete from projects where id = ?").run(projectId);
    }
  });
}

async function assertHtmlVersionSaveWritesPrototypeFile() {
  await withSmokeSession(async (cookie, db) => {
    const projectId = "page-smoke-html-save-project";
    const documentId = "page-smoke-html-save-document";
    const versionId = "page-smoke-html-save-version";
    const dataDir = process.env.DATA_DIR || "./data";
    const prototypeRoot = path.join(dataDir, "prototypes", documentId);
    const initialStoragePath = path.posix.join(documentId, versionId, "index.html");
    const nextContent =
      "<!doctype html><title>Edited HTML Smoke</title><body><h1>Edited HTML Smoke</h1></body>";

    db.prepare("delete from versions where document_id = ?").run(documentId);
    db.prepare("delete from documents where id = ?").run(documentId);
    db.prepare("delete from projects where id = ?").run(projectId);
    fs.rmSync(prototypeRoot, { recursive: true, force: true });
    db.prepare(
      "insert into projects (id, name, description, color, created_by) values (?, ?, ?, ?, ?)"
    ).run(projectId, "Page Smoke HTML Save Project", null, "#6366f1", "page-smoke-user");
    db.prepare(
      "insert into documents (id, project_id, title, type, status, priority, tags, owner_id, current_version_id, description) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      documentId,
      projectId,
      "Page Smoke HTML Save Document",
      "html",
      "draft",
      "P2",
      "[]",
      "page-smoke-user",
      versionId,
      "Smoke HTML save"
    );
    fs.mkdirSync(path.join(prototypeRoot, versionId), { recursive: true });
    fs.writeFileSync(
      path.join(prototypeRoot, versionId, "index.html"),
      "<!doctype html><title>Before HTML Smoke</title>",
      "utf-8"
    );
    db.prepare(
      "insert into versions (id, document_id, commit_sha, message, content, storage_path, size, created_by) values (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      versionId,
      documentId,
      "html-smoke-sha",
      "初始 HTML",
      "<!doctype html><title>Before HTML Smoke</title>",
      initialStoragePath,
      48,
      "page-smoke-user"
    );

    try {
      const response = await fetch(`${baseUrl}/api/documents/${documentId}/versions`, {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: nextContent,
          message: "HTML 文案热修",
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status !== 201 || !body.versionId) {
        throw new Error(
          `Expected HTML version save API to return versionId, got ${response.status}: ${JSON.stringify(body)}`
        );
      }

      const saved = db
        .prepare("select content, storage_path from versions where id = ?")
        .get(body.versionId) as { content: string; storage_path: string };
      if (saved.content !== nextContent) {
        throw new Error("Expected HTML version save API to persist edited HTML");
      }
      if (saved.storage_path !== path.posix.join(documentId, body.versionId, "index.html")) {
        throw new Error("Expected HTML version save API to persist prototype storage_path");
      }
      const savedFile = path.join(dataDir, "prototypes", ...saved.storage_path.split("/"));
      if (!fs.existsSync(savedFile)) {
        throw new Error("Expected HTML version save API to write prototype index.html");
      }
      const protoResponse = await fetch(`${baseUrl}/proto/${saved.storage_path}`);
      if (protoResponse.status !== 200) {
        throw new Error(`Expected saved HTML prototype to be served, got ${protoResponse.status}`);
      }
      const protoHtml = await protoResponse.text();
      if (!protoHtml.includes("Edited HTML Smoke")) {
        throw new Error("Expected saved HTML prototype response to include edited content");
      }
    } finally {
      db.prepare("delete from versions where document_id = ?").run(documentId);
      db.prepare("delete from documents where id = ?").run(documentId);
      db.prepare("delete from projects where id = ?").run(projectId);
      fs.rmSync(prototypeRoot, { recursive: true, force: true });
    }
  });
}

async function assertDocumentDiffAndRollback() {
  await withSmokeSession(async (cookie, db) => {
    const projectId = "page-smoke-diff-project";
    const documentId = "page-smoke-diff-document";
    const oldVersionId = "page-smoke-diff-old-version";
    const currentVersionId = "page-smoke-diff-current-version";
    const oldContent = "# Diff Smoke\n\nold line\n";
    const currentContent = "# Diff Smoke\n\nnew line\n";

    db.prepare("delete from versions where document_id = ?").run(documentId);
    db.prepare("delete from documents where id = ?").run(documentId);
    db.prepare("delete from projects where id = ?").run(projectId);
    db.prepare(
      "insert into projects (id, name, description, color, created_by) values (?, ?, ?, ?, ?)"
    ).run(projectId, "Page Smoke Diff Project", null, "#6366f1", "page-smoke-user");
    db.prepare(
      "insert into documents (id, project_id, title, type, status, priority, tags, owner_id, current_version_id, description) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      documentId,
      projectId,
      "Page Smoke Diff Document",
      "md",
      "draft",
      "P2",
      "[]",
      "page-smoke-user",
      currentVersionId,
      "Smoke diff"
    );
    db.prepare(
      "insert into versions (id, document_id, commit_sha, message, content, size, created_by) values (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      oldVersionId,
      documentId,
      "old-sha",
      "旧版本",
      oldContent,
      Buffer.byteLength(oldContent, "utf-8"),
      "page-smoke-user"
    );
    db.prepare(
      "insert into versions (id, document_id, commit_sha, message, content, size, created_by) values (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      currentVersionId,
      documentId,
      "current-sha",
      "当前版本",
      currentContent,
      Buffer.byteLength(currentContent, "utf-8"),
      "page-smoke-user"
    );

    try {
      const diffResponse = await fetch(
        `${baseUrl}/api/documents/${documentId}/diff?from=${oldVersionId}&to=${currentVersionId}`,
        { headers: { Cookie: cookie } }
      );
      const diffBody = await diffResponse.json().catch(() => ({}));
      if (diffResponse.status !== 200) {
        throw new Error(`Expected diff API to return 200, got ${diffResponse.status}`);
      }
      const diffText = JSON.stringify(diffBody.diff);
      if (!diffText.includes("old line") || !diffText.includes("new line")) {
        throw new Error("Expected diff API to include old and new content");
      }

      const rollbackResponse = await fetch(
        `${baseUrl}/api/documents/${documentId}/versions/${oldVersionId}/rollback`,
        {
          method: "POST",
          headers: { Cookie: cookie },
        }
      );
      const rollbackBody = await rollbackResponse.json().catch(() => ({}));
      if (rollbackResponse.status !== 200 || !rollbackBody.versionId) {
        throw new Error(
          `Expected rollback API to return new version id, got ${rollbackResponse.status}: ${JSON.stringify(rollbackBody)}`
        );
      }

      const document = db
        .prepare("select current_version_id from documents where id = ?")
        .get(documentId) as { current_version_id: string };
      if (document.current_version_id !== rollbackBody.versionId) {
        throw new Error("Expected rollback API to update current_version_id");
      }
      const rolledBack = db
        .prepare("select content from versions where id = ?")
        .get(rollbackBody.versionId) as { content: string };
      if (rolledBack.content !== oldContent) {
        throw new Error("Expected rollback API to persist old content as new version");
      }
    } finally {
      db.prepare("delete from versions where document_id = ?").run(documentId);
      db.prepare("delete from documents where id = ?").run(documentId);
      db.prepare("delete from projects where id = ?").run(projectId);
    }
  });
}

async function assertDocumentCommentApiFlow() {
  await withSmokeSession(async (cookie, db) => {
    const projectId = "page-smoke-comment-project";
    const documentId = "page-smoke-comment-document";
    const versionId = "page-smoke-comment-version";

    db.prepare("delete from comments where document_id = ?").run(documentId);
    db.prepare("delete from versions where document_id = ?").run(documentId);
    db.prepare("delete from documents where id = ?").run(documentId);
    db.prepare("delete from projects where id = ?").run(projectId);
    db.prepare(
      "insert into projects (id, name, description, color, created_by) values (?, ?, ?, ?, ?)"
    ).run(projectId, "Page Smoke Comment Project", null, "#6366f1", "page-smoke-user");
    db.prepare(
      "insert into documents (id, project_id, title, type, status, priority, tags, owner_id, current_version_id, description) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      documentId,
      projectId,
      "Page Smoke Comment Document",
      "md",
      "draft",
      "P2",
      "[]",
      "page-smoke-user",
      versionId,
      "Smoke comments"
    );
    db.prepare(
      "insert into versions (id, document_id, commit_sha, message, content, size, created_by) values (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      versionId,
      documentId,
      "comment-sha",
      "评论版本",
      "# Comment Smoke",
      Buffer.byteLength("# Comment Smoke", "utf-8"),
      "page-smoke-user"
    );

    try {
      const createResponse = await fetch(
        `${baseUrl}/api/documents/${documentId}/comments`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            versionId,
            anchor: {
              type: "element",
              kind: "selection",
              selector: '[data-comment-anchor="line-1"]',
              blockId: "line-1",
              textHash: "comment-smoke-line",
              selectedText: "Comment Smoke",
              startOffset: 0,
              endOffset: 13,
              preview: "Comment Smoke",
            },
            body: "选区评论 smoke",
          }),
        }
      );
      const created = await createResponse.json().catch(() => ({}));
      if (createResponse.status !== 201 || !created.comment?.id) {
        throw new Error(
          `Expected comment create API to return 201, got ${createResponse.status}: ${JSON.stringify(created)}`
        );
      }

      const listResponse = await fetch(
        `${baseUrl}/api/documents/${documentId}/comments?version=${versionId}`,
        { headers: { Cookie: cookie } }
      );
      const list = await listResponse.json().catch(() => ({}));
      if (listResponse.status !== 200) {
        throw new Error(`Expected comment list API to return 200, got ${listResponse.status}`);
      }
      if (!JSON.stringify(list.comments).includes("选区评论 smoke")) {
        throw new Error("Expected comment list API to include created selection comment");
      }

      const deleteResponse = await fetch(
        `${baseUrl}/api/comments/${created.comment.id}`,
        {
          method: "DELETE",
          headers: { Cookie: cookie },
        }
      );
      const deleted = await deleteResponse.json().catch(() => ({}));
      if (deleteResponse.status !== 200 || deleted.ok !== true) {
        throw new Error(
          `Expected comment delete API to remove resolved comment, got ${deleteResponse.status}: ${JSON.stringify(deleted)}`
        );
      }

      const afterDelete = db
        .prepare("select count(*) as count from comments where id = ?")
        .get(created.comment.id) as { count: number };
      if (afterDelete.count !== 0) {
        throw new Error("Expected resolved comment to be deleted from database");
      }
    } finally {
      db.prepare("delete from comments where document_id = ?").run(documentId);
      db.prepare("delete from versions where document_id = ?").run(documentId);
      db.prepare("delete from documents where id = ?").run(documentId);
      db.prepare("delete from projects where id = ?").run(projectId);
    }
  });
}

async function importDocument(
  cookie: string,
  fields: {
    projectId: string;
    title: string;
    filename: string;
    file: Blob;
  }
) {
  const formData = new FormData();
  formData.set("projectId", fields.projectId);
  formData.set("title", fields.title);
  formData.set("priority", "P1");
  formData.set("file", fields.file, fields.filename);

  const response = await fetch(`${baseUrl}/api/documents/import`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: formData,
  });
  const body = await response.json().catch(() => ({}));
  if (response.status !== 201) {
    throw new Error(
      `Expected import ${fields.filename} to return 201, got ${response.status}: ${JSON.stringify(body)}`
    );
  }
  return body as {
    document: {
      id: string;
      type: "md" | "html" | "html-zip";
      currentVersionId: string;
    };
  };
}

async function postImportDocument(
  cookie: string,
  fields: {
    projectId: string;
    title: string;
    filename: string;
    file: Blob;
  }
) {
  const formData = new FormData();
  formData.set("projectId", fields.projectId);
  formData.set("title", fields.title);
  formData.set("priority", "P1");
  formData.set("file", fields.file, fields.filename);

  const response = await fetch(`${baseUrl}/api/documents/import`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: formData,
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function postLocalPathImport(
  cookie: string,
  fields: {
    projectId: string;
    sourcePath: string;
    title: string;
  }
) {
  const response = await fetch(`${baseUrl}/api/documents/import`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      projectId: fields.projectId,
      sourcePath: fields.sourcePath,
      title: fields.title,
      priority: "P1",
    }),
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function assertDocumentImport() {
  await withSmokeSession(async (cookie, db) => {
    const projectId = "page-smoke-import-project";
    const importedDocIds: string[] = [];
    const dataDir = process.env.DATA_DIR || "./data";
    const disabledLocalImportPath = path.resolve(
      dataDir,
      "disabled-local-import.md"
    );

    db.prepare("delete from projects where id = ?").run(projectId);
    db.prepare(
      "insert into projects (id, name, description, color, created_by) values (?, ?, ?, ?, ?)"
    ).run(projectId, "Page Smoke Import Project", null, "#6366f1", "page-smoke-user");

    try {
      fs.mkdirSync(path.dirname(disabledLocalImportPath), { recursive: true });
      fs.writeFileSync(
        disabledLocalImportPath,
        fullMarkdownSmokeContent("Local Path Import Should Be Disabled"),
        "utf-8"
      );
      const localPathImport = await postLocalPathImport(cookie, {
        projectId,
        title: "Local Path Import Should Be Disabled",
        sourcePath: disabledLocalImportPath,
      });
      if (localPathImport.response.status !== 400) {
        throw new Error(
          `Expected local path JSON import to be rejected with 400, got ${localPathImport.response.status}: ${JSON.stringify(localPathImport.body)}`
        );
      }

      const md = await importDocument(cookie, {
        projectId,
        title: "Imported Markdown Smoke",
        filename: "imported-smoke.md",
        file: new Blob([fullMarkdownSmokeContent("Imported Markdown Smoke")], {
          type: "text/markdown",
        }),
      });
      importedDocIds.push(md.document.id);
      if (md.document.type !== "md") {
        throw new Error("Expected imported .md document type to be md");
      }
      const mdVersion = db
        .prepare("select content from versions where id = ?")
        .get(md.document.currentVersionId) as { content: string };
      if (!mdVersion.content.includes("Imported Markdown Smoke")) {
        throw new Error("Expected imported .md content to be persisted");
      }

      const htmlContent = "<!doctype html><title>Imported HTML Smoke</title><h1>Imported HTML Smoke</h1>";
      const html = await importDocument(cookie, {
        projectId,
        title: "Imported HTML Smoke",
        filename: "imported-smoke.html",
        file: new Blob([htmlContent], { type: "text/html" }),
      });
      importedDocIds.push(html.document.id);
      if (html.document.type !== "html") {
        throw new Error("Expected imported .html document type to be html");
      }
      const htmlVersion = db
        .prepare("select content, storage_path from versions where id = ?")
        .get(html.document.currentVersionId) as { content: string; storage_path: string };
      if (!htmlVersion.content.includes("Imported HTML Smoke") || !htmlVersion.storage_path) {
        throw new Error("Expected imported .html content and storage_path");
      }

      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip();
      zip.addFile(
        "index.html",
        Buffer.from(
          '<!doctype html><title>Imported Zip Smoke</title><link rel="stylesheet" href="assets/style.css"><h1>Imported Zip Smoke</h1>',
          "utf-8"
        )
      );
      zip.addFile("assets/style.css", Buffer.from("h1{color:#0f766e}", "utf-8"));
      const zipBuffer = zip.toBuffer();
      const zipped = await importDocument(cookie, {
        projectId,
        title: "Imported Zip Smoke",
        filename: "imported-smoke.zip",
        file: new Blob([new Uint8Array(zipBuffer)], { type: "application/zip" }),
      });
      importedDocIds.push(zipped.document.id);
      if (zipped.document.type !== "html-zip") {
        throw new Error("Expected imported .zip document type to be html-zip");
      }

      const zipVersion = db
        .prepare("select storage_path from versions where id = ?")
        .get(zipped.document.currentVersionId) as { storage_path: string };
      if (!zipVersion.storage_path.endsWith("index.html")) {
        throw new Error("Expected imported .zip storage_path to point at index.html");
      }
      const protoResponse = await fetch(`${baseUrl}/proto/${zipVersion.storage_path}`);
      if (protoResponse.status !== 200) {
        throw new Error(`Expected imported .zip prototype to be served, got ${protoResponse.status}`);
      }
      const protoHtml = await protoResponse.text();
      if (!protoHtml.includes("Imported Zip Smoke")) {
        throw new Error("Expected imported .zip prototype HTML body");
      }

      const invalidZip = new AdmZip();
      invalidZip.addFile("bad?/index.html", Buffer.from("<h1>Bad path</h1>", "utf-8"));
      const invalidImport = await postImportDocument(cookie, {
        projectId,
        title: "Invalid Zip Path Smoke",
        filename: "invalid-zip-path.zip",
        file: new Blob([new Uint8Array(invalidZip.toBuffer())], {
          type: "application/zip",
        }),
      });
      if (invalidImport.response.status !== 400) {
        throw new Error(
          `Expected invalid zip path import to return 400, got ${invalidImport.response.status}: ${JSON.stringify(invalidImport.body)}`
        );
      }
      if (!String(invalidImport.body.error || "").includes("非法路径")) {
        throw new Error("Expected invalid zip path import to explain the path error");
      }
    } finally {
      for (const docId of importedDocIds) {
        db.prepare("delete from versions where document_id = ?").run(docId);
        db.prepare("delete from documents where id = ?").run(docId);
        fs.rmSync(path.join(dataDir, "prototypes", docId), {
          recursive: true,
          force: true,
        });
        fs.rmSync(path.join(dataDir, "repos", docId), {
          recursive: true,
          force: true,
        });
      }
      fs.rmSync(disabledLocalImportPath, { force: true });
      db.prepare("delete from projects where id = ?").run(projectId);
    }
  });
}

async function assertPrototypeSandboxPage() {
  await withSmokeSession(async (cookie, db) => {
    const projectId = "page-smoke-prototype-project";
    const documentId = "page-smoke-prototype-document";
    const prdDocumentId = "page-smoke-prototype-prd";
    const prdVersionId = "page-smoke-prototype-prd-v1";
    const previousVersionId = "page-smoke-prototype-v1";
    const currentVersionId = "page-smoke-prototype-v2";
    const dataDir = process.env.DATA_DIR || "./data";
    const prototypeRoot = path.join(dataDir, "prototypes", documentId);
    const previousStoragePath = path.posix.join(
      documentId,
      previousVersionId,
      "index.html"
    );
    const currentStoragePath = path.posix.join(
      documentId,
      currentVersionId,
      "index.html"
    );

    db.prepare("delete from versions where document_id = ?").run(documentId);
    db.prepare("delete from documents where id = ?").run(documentId);
    db.prepare("delete from versions where document_id = ?").run(prdDocumentId);
    db.prepare("delete from documents where id = ?").run(prdDocumentId);
    db.prepare("delete from projects where id = ?").run(projectId);
    fs.rmSync(prototypeRoot, { recursive: true, force: true });
    db.prepare(
      "insert into projects (id, name, description, color, created_by) values (?, ?, ?, ?, ?)"
    ).run(
      projectId,
      "Prototype Sandbox Smoke Project",
      null,
      "#6366f1",
      "page-smoke-user"
    );
    db.prepare(
      "insert into documents (id, project_id, title, type, status, priority, tags, owner_id, current_version_id, description) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      documentId,
      projectId,
      "Prototype Sandbox Smoke",
      "html",
      "draft",
      "P2",
      "[]",
      "page-smoke-user",
      currentVersionId,
      "Prototype sandbox smoke"
    );
    db.prepare(
      "insert into documents (id, project_id, title, type, status, priority, tags, owner_id, current_version_id, description) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      prdDocumentId,
      projectId,
      "Prototype Linked PRD",
      "md",
      "draft",
      "P1",
      "[]",
      "page-smoke-user",
      prdVersionId,
      "Linked PRD for joint review"
    );

    fs.mkdirSync(path.join(prototypeRoot, previousVersionId), { recursive: true });
    fs.mkdirSync(path.join(prototypeRoot, currentVersionId), { recursive: true });
    fs.writeFileSync(
      path.join(prototypeRoot, previousVersionId, "index.html"),
      '<!doctype html><title>Prototype V1 Smoke</title><form><input name="q"><button>Submit V1</button></form><script>window.__smoke="v1"</script>',
      "utf-8"
    );
    fs.writeFileSync(
      path.join(prototypeRoot, currentVersionId, "index.html"),
      '<!doctype html><title>Prototype V2 Smoke</title><form><input name="q"><button>Submit V2</button></form><script>window.__smoke="v2"</script>',
      "utf-8"
    );
    db.prepare(
      "insert into versions (id, document_id, commit_sha, message, content, storage_path, size, created_by) values (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      prdVersionId,
      prdDocumentId,
      "prototype-prd-sha",
      "PRD v1",
      "# Prototype Linked PRD\n\n## Scope\n\nUse this PRD beside the prototype.",
      null,
      68,
      "page-smoke-user"
    );
    db.prepare(
      "insert into versions (id, document_id, commit_sha, message, content, storage_path, size, created_by) values (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      previousVersionId,
      documentId,
      "prototype-v1-sha",
      "原型 v1",
      "<!doctype html><title>Prototype V1 Smoke</title>",
      previousStoragePath,
      128,
      "page-smoke-user"
    );
    db.prepare(
      "insert into versions (id, document_id, commit_sha, message, content, storage_path, size, created_by) values (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      currentVersionId,
      documentId,
      "prototype-v2-sha",
      "原型 v2",
      "<!doctype html><title>Prototype V2 Smoke</title>",
      currentStoragePath,
      128,
      "page-smoke-user"
    );
    db.prepare(
      "insert into comments (id, document_id, version_id, anchor_type, anchor_data, body, status, created_by) values (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "page-smoke-prototype-comment",
      documentId,
      previousVersionId,
      "element",
      JSON.stringify({
        type: "element",
        kind: "prototype-rect",
        selector: 'iframe[title="原型沙盘预览"]',
        textHash: "prototype-v1:/proto",
        preview: "原型标注 20%, 30%",
        pagePath: `/proto/${previousStoragePath}`,
        viewport: { w: 960, h: 640 },
        bbox: { x: 20, y: 30, w: 18, h: 12 },
      }),
      "视觉标注 smoke",
      "open",
      "page-smoke-user"
    );

    try {
      const createCommentResponse = await fetch(
        `${baseUrl}/api/documents/${documentId}/comments`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            versionId: previousVersionId,
            anchor: {
              type: "element",
              kind: "prototype-element",
              selector: "button#submit-primary",
              textHash: "prototype-v1:/proto:button#submit-primary|提交",
              preview: "button · 提交",
              pagePath: `/proto/${previousStoragePath}`,
              viewport: { w: 960, h: 640 },
              bbox: { x: 40, y: 50, w: 10, h: 8 },
              domAnchor: {
                selector: "button#submit-primary",
                xpath: "/html/body/form/button[1]",
                tagName: "button",
                id: "submit-primary",
                text: "提交",
                fingerprint: "button#submit-primary|提交",
              },
            },
            body: "通过 API 创建原型视觉标注",
          }),
        }
      );
      const createCommentBody = await createCommentResponse
        .json()
        .catch(() => ({}));
      if (createCommentResponse.status !== 201 || !createCommentBody.comment?.id) {
        throw new Error(
          `Expected prototype visual comment API to return 201, got ${createCommentResponse.status}: ${JSON.stringify(createCommentBody)}`
        );
      }

      const response = await fetch(
        `${baseUrl}/docs/${documentId}?version=${previousVersionId}`,
        { headers: { Cookie: cookie } }
      );
      if (response.status !== 200) {
        throw new Error(
          `Expected prototype sandbox page to return 200, got ${response.status}`
        );
      }

      const html = await response.text();
      for (const text of [
        "原型预览",
        "刷新",
        "打开",
        "全屏",
        'data-prototype-sandbox-mode="preview"',
        'data-prototype-comment-panel="hidden"',
      ]) {
        if (!html.includes(text)) {
          throw new Error(`Expected prototype preview page to include ${text}`);
        }
      }
      for (const excluded of [
        "data-review-scope-switcher",
        "标注",
        "保存新版",
        "导出 HTML",
        "通过 API 创建原型视觉标注",
      ]) {
        if (html.includes(excluded)) {
          throw new Error(`Expected prototype preview page to exclude ${excluded}`);
        }
      }
      if (html.includes("data-prototype-comment-marker")) {
        throw new Error(
          "Expected prototype sandbox to keep visual markers hidden by default in browse mode"
        );
      }
      if (html.includes("标注 1 ·")) {
        throw new Error("Expected prototype comment cards to avoid heavy anchor labels");
      }
      if (!html.includes(`/proto/${previousStoragePath}`)) {
        throw new Error("Expected prototype sandbox to preview the requested version");
      }
      if (!html.includes('sandbox="allow-scripts allow-forms allow-modals allow-popups"')) {
        throw new Error("Expected prototype iframe to allow scripts and forms");
      }
      for (const excluded of ["设备尺寸", "缺失资源", "JS 错误", "预览链接分享"]) {
        if (html.includes(excluded)) {
          throw new Error(`Expected prototype sandbox to exclude ${excluded}`);
        }
      }

      const reviewResponse = await fetch(
        `${baseUrl}/docs/${documentId}?mode=review&version=${previousVersionId}`,
        { headers: { Cookie: cookie } }
      );
      if (reviewResponse.status !== 200) {
        throw new Error(
          `Expected prototype review page to return 200, got ${reviewResponse.status}`
        );
      }
      const reviewHtml = await reviewResponse.text();
      for (const text of [
        "原型评审",
        "联合评审",
        "需求评审",
        "编辑",
        "标注",
        "评论",
        "开启标注后，点击元素添加评论。",
        "通过 API 创建原型视觉标注",
        "data-review-scope-switcher",
        'data-prototype-sandbox-mode="review"',
      ]) {
        if (!reviewHtml.includes(text)) {
          throw new Error(`Expected prototype review page to include ${text}`);
        }
      }
      for (const excluded of ["只看 HTML", "只看 PRD", "元素命中标注"]) {
        if (reviewHtml.includes(excluded)) {
          throw new Error(`Expected prototype review page to exclude legacy text ${excluded}`);
        }
      }

      const jointResponse = await fetch(
        `${baseUrl}/docs/${documentId}?mode=joint&version=${previousVersionId}`,
        { headers: { Cookie: cookie } }
      );
      if (jointResponse.status !== 200) {
        throw new Error(
          `Expected prototype joint review page to return 200, got ${jointResponse.status}`
        );
      }
      const jointHtml = await jointResponse.text();
      for (const text of [
        "联合评审",
        "需求评审",
        "原型评审",
        "PRD 对照",
        "Prototype Linked PRD",
        "Use this PRD beside the prototype",
        "原型评审",
        "通过 API 创建原型视觉标注",
      ]) {
        if (!jointHtml.includes(text)) {
          throw new Error(`Expected joint review page to include ${text}`);
        }
      }
      for (const marker of [
        'data-prototype-viewport="1366x768"',
        'data-prototype-comment-panel="collapsed"',
        'data-joint-review-resizable="true"',
        'aria-label="调整 PRD 对照宽度"',
      ]) {
        if (!jointHtml.includes(marker)) {
          throw new Error(`Expected joint review page to include ${marker}`);
        }
      }
      if (jointHtml.includes("标注 1 ·")) {
        throw new Error("Expected joint review comments to keep cards lightweight");
      }
    } finally {
      db.prepare("delete from comments where document_id = ?").run(documentId);
      db.prepare("delete from versions where document_id = ?").run(documentId);
      db.prepare("delete from documents where id = ?").run(documentId);
      db.prepare("delete from versions where document_id = ?").run(prdDocumentId);
      db.prepare("delete from documents where id = ?").run(prdDocumentId);
      db.prepare("delete from projects where id = ?").run(projectId);
      fs.rmSync(prototypeRoot, { recursive: true, force: true });
    }
  });
}

async function main() {
  assertFloatingActionsRenderThroughPortal();
  await assertPage("/projects");
  await assertPage("/docs");
  await assertPage("/board");
  await assertRolePermissionsAndReadTracking();
  await assertProjectsCreateEntry();
  await assertSolutionAssetStructure();
  await assertSolutionReviewWorkflow();
  await assertDocumentsCreateEntry();
  await assertDocumentDetailPage();
  await assertDocumentVersionSave();
  await assertHtmlVersionSaveWritesPrototypeFile();
  await assertDocumentDiffAndRollback();
  await assertDocumentCommentApiFlow();
  await assertDocumentImport();
  await assertPrototypeSandboxPage();
  console.log("Page smoke test passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
