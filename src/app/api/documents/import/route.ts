import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";
import { requireAuth } from "@/lib/auth";
import {
  assertCanModifySolutions,
  forbiddenResponseMessage,
} from "@/lib/auth/permissions";
import { schema } from "@/lib/db";
import { getRequestContext } from "@/lib/tenants/server";
import { commit } from "@/lib/git";
import { genId } from "@/lib/utils";

const supportedExtensions = [".md", ".html", ".htm", ".zip"];
const windowsReservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const windowsInvalidChars = /[<>:"|?*\x00-\x1F]/;

function inferTitle(filename: string) {
  return path.basename(filename, path.extname(filename)).trim() || "未命名文档";
}

function normalizeTitle(value: unknown, filename: string) {
  const title = typeof value === "string" ? value.trim() : "";
  return title || inferTitle(filename);
}

function parsePriority(value: unknown) {
  return value === "P0" || value === "P1" || value === "P2" || value === "P3"
    ? value
    : "P2";
}

function normalizeDescription(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { db, dataDir } = await getRequestContext();
    assertCanModifySolutions(user);
    const maxSize = Number(process.env.MAX_UPLOAD_SIZE_MB || 50) * 1024 * 1024;
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "缺少文件" }, { status: 400 });
    }
    const file = formData.get("file");
    const projectId = formData.get("projectId");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少文件" }, { status: 400 });
    }
    if (file.size > maxSize) {
      return NextResponse.json({ error: "文件过大" }, { status: 400 });
    }

    if (typeof projectId !== "string" || !projectId.trim()) {
      return NextResponse.json({ error: "缺少项目" }, { status: 400 });
    }

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const filename = file.name;
    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = path.extname(filename).toLowerCase();
    if (!supportedExtensions.includes(extension)) {
      return NextResponse.json(
        { error: "不支持的文件类型,请上传 .md / .html / .zip" },
        { status: 400 }
      );
    }

    const title = normalizeTitle(formData.get("title"), filename).slice(0, 128);
    const description = normalizeDescription(formData.get("description"));
    const priority = parsePriority(formData.get("priority"));
    const docId = genId();
    const versionId = genId();
    const targetDir = path.join(dataDir, "prototypes", docId, versionId);

    let type: "md" | "html" | "html-zip";
    let content: string | null = null;
    let storagePath: string | null = null;
    let commitSha: string | null = null;

    if (extension === ".md") {
      type = "md";
      content = buffer.toString("utf-8");
      commitSha = await commit(
      dataDir,
        docId,
        { "content.md": content },
        `导入 ${filename}`,
        { name: user.displayName, email: user.email }
      );
    } else if (extension === ".html" || extension === ".htm") {
      type = "html";
      content = buffer.toString("utf-8");
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, "index.html"), buffer);
      storagePath = path.posix.join(docId, versionId, "index.html");
      commitSha = await commit(
      dataDir,
        docId,
        { "index.html": content },
        `导入 ${filename}`,
        { name: user.displayName, email: user.email }
      );
    } else {
      type = "html-zip";
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries();
      const extracted = extractZipEntries(entries, targetDir);
      if (!extracted.ok) {
        return NextResponse.json({ error: extracted.error }, { status: 400 });
      }
      const entryFile = findIndexFile(targetDir);
      if (!entryFile) {
        return NextResponse.json(
          { error: "zip 中未找到 index.html" },
          { status: 400 }
        );
      }
      storagePath = path.posix.join(docId, versionId, entryFile);
    }

    db.insert(schema.documents).values({
      id: docId,
      projectId,
      title,
      type,
      description,
      priority,
      tags: [],
      ownerId: user.id,
      currentVersionId: versionId,
    }).run();

    db.insert(schema.versions).values({
      id: versionId,
      documentId: docId,
      commitSha,
      message: `导入 ${filename}`,
      content,
      storagePath,
      size: buffer.byteLength,
      createdBy: user.id,
    }).run();

    const document = db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, docId))
      .get();

    return NextResponse.json({ document }, { status: 201 });
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
