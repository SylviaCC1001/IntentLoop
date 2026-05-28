import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { genId } from "@/lib/utils";
import { commit } from "@/lib/git";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

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

    const filename = doc.type === "md" ? "content.md" : "index.html";
    const sha = await commit(
      id,
      { [filename]: content },
      message || `保存于 ${new Date().toLocaleString("zh-CN")}`,
      { name: user.displayName, email: user.email }
    );

    const versionId = genId();
    db.insert(schema.versions).values({
      id: versionId,
      documentId: id,
      commitSha: sha,
      message: message || "",
      content,
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
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
