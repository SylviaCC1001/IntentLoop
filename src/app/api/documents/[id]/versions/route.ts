import { NextRequest, NextResponse } from "next/server";
import { schema } from "@/lib/db";
import { getRequestContext } from "@/lib/tenants/server";
import { requireAuth } from "@/lib/auth";
import {
  assertCanModifySolutions,
  forbiddenResponseMessage,
} from "@/lib/auth/permissions";
import { genId } from "@/lib/utils";
import { commit } from "@/lib/git";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import fs from "fs";
import path from "path";

const createSchema = z.object({
  content: z.string(),
  message: z.string().optional(),
});

// GET /api/documents/:id/versions - 历史
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { db } = await getRequestContext();
    const { id } = await params;
    const versions = db
      .select()
      .from(schema.versions)
      .where(eq(schema.versions.documentId, id))
      .orderBy(desc(schema.versions.createdAt))
      .all();
    return NextResponse.json({ versions });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// POST /api/documents/:id/versions - 保存新版本(MD/HTML 文本类)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { db, dataDir } = await getRequestContext();
    assertCanModifySolutions(user);
    const { id } = await params;
    const body = await req.json();
    const { content, message } = createSchema.parse(body);

    const doc = db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, id))
      .get();
    if (!doc) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }
    if (doc.type === "html-zip") {
      return NextResponse.json(
        { error: "多文件原型请用上传接口" },
        { status: 400 }
      );
    }

    const versionId = genId();
    const filename = doc.type === "md" ? "content.md" : "index.html";
    const sha = await commit(
      dataDir,
      id,
      { [filename]: content },
      message || `保存于 ${new Date().toLocaleString("zh-CN")}`,
      { name: user.displayName, email: user.email }
    );

    let storagePath: string | null = null;
    if (doc.type === "html") {
      const targetDir = path.join(dataDir, "prototypes", id, versionId);
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, "index.html"), content, "utf-8");
      storagePath = path.posix.join(id, versionId, "index.html");
    }

    db.insert(schema.versions).values({
      id: versionId,
      documentId: id,
      commitSha: sha,
      message: message || "",
      content,
      storagePath,
      size: Buffer.byteLength(content, "utf-8"),
      createdBy: user.id,
    }).run();

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
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
