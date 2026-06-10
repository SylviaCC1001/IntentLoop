import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  assertCanModifySolutions,
  forbiddenResponseMessage,
} from "@/lib/auth/permissions";
import { genId } from "@/lib/utils";
import AdmZip from "adm-zip";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs";

// POST /api/documents/[id]/upload - 上传 HTML zip 包(创建新版本)
// 也支持创建一个新文档(传 projectId / title 当首次)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    assertCanModifySolutions(user);
    const { id } = await params;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const message = (formData.get("message") as string) || "";

    if (!file) {
      return NextResponse.json({ error: "缺少文件" }, { status: 400 });
    }

    const doc = db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, id))
      .get();
    if (!doc) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const versionId = genId();
    const dataDir = process.env.DATA_DIR || "./data";
    const targetDir = path.join(
      dataDir,
      "prototypes",
      id,
      versionId
    );
    fs.mkdirSync(targetDir, { recursive: true });

    if (file.name.endsWith(".zip")) {
      // zip 解压
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries();
      // 安全:路径穿越检查
      for (const entry of entries) {
        const entryPath = path.normalize(entry.entryName);
        if (entryPath.startsWith("..") || path.isAbsolute(entryPath)) {
          return NextResponse.json(
            { error: `非法路径: ${entry.entryName}` },
            { status: 400 }
          );
        }
      }
      zip.extractAllTo(targetDir, true);

      // 找入口 index.html(在解压目录下递归找,优先根目录)
      let entryFile = "index.html";
      const rootIndex = path.join(targetDir, "index.html");
      if (!fs.existsSync(rootIndex)) {
        // 查一层:有些 zip 解出来是带一级目录
        const subdirs = fs
          .readdirSync(targetDir, { withFileTypes: true })
          .filter((d) => d.isDirectory());
        for (const sub of subdirs) {
          const candidate = path.join(targetDir, sub.name, "index.html");
          if (fs.existsSync(candidate)) {
            entryFile = path.posix.join(sub.name, "index.html");
            break;
          }
        }
      }

      const storagePath = path.posix.join("prototypes", id, versionId, entryFile);

      // 更新文档类型为 html-zip
      db.update(schema.documents)
        .set({ type: "html-zip", updatedAt: new Date() })
        .where(eq(schema.documents.id, id))
        .run();

      db.insert(schema.versions).values({
        id: versionId,
        documentId: id,
        message: message || `上传 ${file.name}`,
        content: null,
        storagePath,
        size: buffer.byteLength,
        createdBy: user.id,
      }).run();
    } else if (file.name.endsWith(".html") || file.name.endsWith(".htm")) {
      // 单 HTML 文件
      fs.writeFileSync(path.join(targetDir, "index.html"), buffer);
      const content = buffer.toString("utf-8");
      const storagePath = path.posix.join("prototypes", id, versionId, "index.html");

      db.update(schema.documents)
        .set({ type: "html", updatedAt: new Date() })
        .where(eq(schema.documents.id, id))
        .run();

      db.insert(schema.versions).values({
        id: versionId,
        documentId: id,
        message: message || `上传 ${file.name}`,
        content,
        storagePath,
        size: buffer.byteLength,
        createdBy: user.id,
      }).run();
    } else if (file.name.endsWith(".md")) {
      const content = buffer.toString("utf-8");
      db.update(schema.documents)
        .set({ type: "md", updatedAt: new Date() })
        .where(eq(schema.documents.id, id))
        .run();
      db.insert(schema.versions).values({
        id: versionId,
        documentId: id,
        message: message || `上传 ${file.name}`,
        content,
        size: buffer.byteLength,
        createdBy: user.id,
      }).run();
    } else {
      return NextResponse.json(
        { error: "不支持的文件类型,请上传 .md / .html / .zip" },
        { status: 400 }
      );
    }

    db.update(schema.documents)
      .set({ currentVersionId: versionId, updatedAt: new Date() })
      .where(eq(schema.documents.id, id))
      .run();

    return NextResponse.json({ versionId }, { status: 201 });
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

export const config = {
  api: {
    bodyParser: false,
  },
};
