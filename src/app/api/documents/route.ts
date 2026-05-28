import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { genId } from "@/lib/utils";
import { commit } from "@/lib/git";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";

const createSchema = z.object({
  projectId: z.string(),
  title: z.string().min(1).max(128),
  type: z.enum(["md", "html"]),
  content: z.string().default(""),
  description: z.string().optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  tags: z.array(z.string()).optional(),
});

// GET /api/documents?project=xxx&status=xxx
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("project");
    const status = searchParams.get("status");

    const conditions = [];
    if (projectId) conditions.push(eq(schema.documents.projectId, projectId));
    if (status)
      conditions.push(
        eq(
          schema.documents.status,
          status as "draft" | "reviewing" | "published" | "archived"
        )
      );

    const docs = db
      .select()
      .from(schema.documents)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.documents.updatedAt))
      .all();

    return NextResponse.json({ documents: docs });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// POST /api/documents - 创建文档(在线 MD 或 HTML)
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const data = createSchema.parse(body);

    const docId = genId();
    const versionId = genId();

    // 创建文档
    db.insert(schema.documents).values({
      id: docId,
      projectId: data.projectId,
      title: data.title,
      type: data.type,
      description: data.description || null,
      priority: data.priority || "P2",
      tags: data.tags || [],
      ownerId: user.id,
      currentVersionId: versionId,
    }).run();

    // 创建初始版本
    const filename = data.type === "md" ? "content.md" : "index.html";
    const sha = await commit(
      docId,
      { [filename]: data.content },
      "Initial commit",
      { name: user.displayName, email: user.email }
    );

    db.insert(schema.versions).values({
      id: versionId,
      documentId: docId,
      commitSha: sha,
      message: "初始版本",
      content: data.content,
      size: Buffer.byteLength(data.content, "utf-8"),
      createdBy: user.id,
    }).run();

    const doc = db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, docId))
      .get();

    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "参数错误", detail: e.errors }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
