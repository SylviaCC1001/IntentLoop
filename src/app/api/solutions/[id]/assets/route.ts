import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";
import { requireAuth } from "@/lib/auth";
import {
  assertCanModifySolutions,
  forbiddenResponseMessage,
} from "@/lib/auth/permissions";
import { db, schema } from "@/lib/db";
import { commit } from "@/lib/git";
import { genId } from "@/lib/utils";

const windowsReservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const windowsInvalidChars = /[<>:"|?*\x00-\x1F]/;

function inferTitle(filename: string) {
  return path.basename(filename, path.extname(filename)).trim() || "未命名资产";
}

function normalizeTitle(value: FormDataEntryValue | null, filename: string) {
  const title = typeof value === "string" ? value.trim() : "";
  return (title || inferTitle(filename)).slice(0, 128);
}

function normalizeMessage(value: FormDataEntryValue | null, fallback: string) {
  const message = typeof value === "string" ? value.trim() : "";
  return message || fallback;
}

function normalizeZipEntryPath(entryName: string) {
  if (
    !entryName ||
    entryName.includes("\0") ||
    path.posix.isAbsolute(entryName) ||
    path.win32.isAbsolute(entryName)
  ) {
    return null;
  }

  const normalized = path.posix.normalize(entryName.replace(/\\/g, "/"));
  if (!normalized || normalized === "." || normalized.startsWith("../")) {
    return null;
  }

  const segments = normalized.split("/");
  for (const segment of segments) {
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      windowsInvalidChars.test(segment) ||
      /[. ]$/.test(segment) ||
      windowsReservedNames.test(segment)
    ) {
      return null;
    }
  }

  return normalized;
}

function safeJoin(root: string, relativePath: string) {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(root, ...relativePath.split("/"));
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    return null;
  }
  return resolvedPath;
}

function extractZipEntries(
  entries: AdmZip.IZipEntry[],
  targetDir: string
): { ok: true } | { ok: false; error: string } {
  const normalizedEntries = entries.map((entry) => ({
    entry,
    relativePath: normalizeZipEntryPath(entry.entryName),
  }));

  for (const item of normalizedEntries) {
    if (!item.relativePath) {
      return { ok: false, error: `非法路径: ${item.entry.entryName}` };
    }
  }

  fs.mkdirSync(targetDir, { recursive: true });

  for (const { entry, relativePath } of normalizedEntries) {
    const destination = safeJoin(targetDir, relativePath!);
    if (!destination) {
      return { ok: false, error: `非法路径: ${entry.entryName}` };
    }

    if (entry.isDirectory) {
      fs.mkdirSync(destination, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, entry.getData());
    }
  }

  return { ok: true };
}

function findIndexFile(root: string) {
  const queue = [root];
  while (queue.length) {
    const current = queue.shift()!;
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, item.name);
      if (item.isDirectory()) {
        queue.push(fullPath);
      } else if (item.isFile() && item.name.toLowerCase() === "index.html") {
        return path.relative(root, fullPath).split(path.sep).join(path.posix.sep);
      }
    }
  }
  return null;
}

function safeAppendixName(filename: string) {
  const base = path.basename(filename).replace(/[<>:"|?*\x00-\x1F]/g, "_").trim();
  if (!base || base === "." || base === ".." || windowsReservedNames.test(base)) {
    return "attachment.bin";
  }
  return base;
}

function findCurrentAsset(solutionId: string, assetType: "prd" | "prototype") {
  const allowedTypes: Array<"md" | "html" | "html-zip" | "appendix"> =
    assetType === "prd" ? ["md"] : ["html", "html-zip"];
  return db
    .select()
    .from(schema.documents)
    .where(
      and(
        eq(schema.documents.projectId, solutionId),
        inArray(schema.documents.type, allowedTypes)
      )
    )
    .orderBy(desc(schema.documents.updatedAt))
    .get();
}

async function upsertVersionedAsset({
  solutionId,
  file,
  buffer,
  assetType,
  title,
  message,
  user,
}: {
  solutionId: string;
  file: File;
  buffer: Buffer;
  assetType: "prd" | "prototype";
  title: string;
  message: string;
  user: Awaited<ReturnType<typeof requireAuth>>;
}) {
  const filename = file.name;
  const extension = path.extname(filename).toLowerCase();

  if (assetType === "prd" && extension !== ".md") {
    return { error: "PRD 仅支持 .md 文件" };
  }
  if (
    assetType === "prototype" &&
    extension !== ".html" &&
    extension !== ".htm" &&
    extension !== ".zip"
  ) {
    return { error: "交互原型仅支持 .html / .zip 文件" };
  }

  const existing = findCurrentAsset(solutionId, assetType);
  const documentId = existing?.id ?? genId();
  const versionId = genId();
  const dataDir = process.env.DATA_DIR || "./data";
  const targetDir = path.join(dataDir, "prototypes", documentId, versionId);
  let type: "md" | "html" | "html-zip";
  let content: string | null = null;
  let storagePath: string | null = null;
  let commitSha: string | null = null;

  if (extension === ".md") {
    type = "md";
    content = buffer.toString("utf-8");
    commitSha = await commit(
      documentId,
      { "content.md": content },
      message,
      { name: user.displayName, email: user.email }
    );
  } else if (extension === ".html" || extension === ".htm") {
    type = "html";
    content = buffer.toString("utf-8");
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, "index.html"), buffer);
    storagePath = path.posix.join(documentId, versionId, "index.html");
    commitSha = await commit(
      documentId,
      { "index.html": content },
      message,
      { name: user.displayName, email: user.email }
    );
  } else {
    type = "html-zip";
    const zip = new AdmZip(buffer);
    const extracted = extractZipEntries(zip.getEntries(), targetDir);
    if (!extracted.ok) {
      return { error: extracted.error };
    }
    const entryFile = findIndexFile(targetDir);
    if (!entryFile) {
      return { error: "zip 中未找到 index.html" };
    }
    storagePath = path.posix.join(documentId, versionId, entryFile);
  }

  if (existing) {
    db.update(schema.documents)
      .set({
        title,
        type,
        description: message,
        currentVersionId: versionId,
        updatedAt: new Date(),
      })
      .where(eq(schema.documents.id, existing.id))
      .run();
  } else {
    db.insert(schema.documents).values({
      id: documentId,
      projectId: solutionId,
      title,
      type,
      description: message,
      priority: "P2",
      tags: [],
      ownerId: user.id,
      currentVersionId: versionId,
    }).run();
  }

  db.insert(schema.versions).values({
    id: versionId,
    documentId,
    commitSha,
    message,
    content,
    storagePath,
    size: buffer.byteLength,
    createdBy: user.id,
  }).run();

  db.update(schema.projects)
    .set({ updatedAt: new Date() })
    .where(eq(schema.projects.id, solutionId))
    .run();

  const document = db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.id, documentId))
    .get();

  return { document, versionId };
}

function createAppendix({
  solutionId,
  file,
  buffer,
  title,
  message,
  userId,
}: {
  solutionId: string;
  file: File;
  buffer: Buffer;
  title: string;
  message: string;
  userId: string;
}) {
  const documentId = genId();
  const versionId = genId();
  const filename = safeAppendixName(file.name);
  const dataDir = process.env.DATA_DIR || "./data";
  const targetDir = path.join(dataDir, "appendices", solutionId, documentId);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, filename), buffer);
  const storagePath = path.posix.join("appendices", solutionId, documentId, filename);

  db.insert(schema.documents).values({
    id: documentId,
    projectId: solutionId,
    title,
    type: "appendix",
    description: message || filename,
    priority: "P3",
    tags: [],
    ownerId: userId,
    currentVersionId: versionId,
  }).run();

  db.insert(schema.versions).values({
    id: versionId,
    documentId,
    message: message || `上传 ${filename}`,
    storagePath,
    size: buffer.byteLength,
    createdBy: userId,
  }).run();

  db.update(schema.projects)
    .set({ updatedAt: new Date() })
    .where(eq(schema.projects.id, solutionId))
    .run();

  const document = db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.id, documentId))
    .get();

  return { document, versionId };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    assertCanModifySolutions(user);
    const { id } = await params;
    const solution = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();
    if (!solution) {
      return NextResponse.json({ error: "需求方案不存在" }, { status: 404 });
    }

    const maxSize = Number(process.env.MAX_UPLOAD_SIZE_MB || 50) * 1024 * 1024;
    const formData = await req.formData();
    const assetType = formData.get("assetType");
    const file = formData.get("file");
    if (assetType !== "prd" && assetType !== "prototype" && assetType !== "appendix") {
      return NextResponse.json({ error: "资产类型错误" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少文件" }, { status: 400 });
    }
    if (file.size > maxSize) {
      return NextResponse.json({ error: "文件过大" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const title = normalizeTitle(formData.get("title"), file.name);
    const message = normalizeMessage(formData.get("message"), `上传 ${file.name}`);

    const result =
      assetType === "appendix"
        ? createAppendix({
            solutionId: id,
            file,
            buffer,
            title,
            message,
            userId: user.id,
          })
        : await upsertVersionedAsset({
            solutionId: id,
            file,
            buffer,
            assetType,
            title,
            message,
            user,
          });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (e instanceof Error) {
      const message = forbiddenResponseMessage(e);
      if (message) {
        return NextResponse.json({ error: message }, { status: 403 });
      }
    }
    console.error(e);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
