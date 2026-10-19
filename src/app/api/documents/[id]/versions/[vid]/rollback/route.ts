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
import { and, eq } from "drizzle-orm";

// POST /api/documents/:id/versions/:vid/rollback - 回滚到该版本
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; vid: string }> }
) {
  try {
    const user = await requireAuth();
    const { db, dataDir } = await getRequestContext();
    assertCanModifySolutions(user);
    const { id, vid } = await params;

    const target = db
      .select()
      .from(schema.versions)
      .where(and(eq(schema.versions.id, vid), eq(schema.versions.documentId, id)))
      .get();
    if (!target) {
      return NextResponse.json({ error: "版本不存在" }, { status: 404 });
    }

    const doc = db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, id))
      .get();
    if (!doc) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }

    // 回滚 = 用旧版本内容创建一个新 commit
    const filename = doc.type === "md" ? "content.md" : "index.html";
    const content = target.content || "";
    const sha = await commit(
      dataDir,
      id,
      { [filename]: content },
      `回滚到版本 ${vid.slice(0, 8)}`,
      { name: user.displayName, email: user.email }
    );

    const newVersionId = genId();
    db.insert(schema.versions).values({
      id: newVersionId,
      documentId: id,
      commitSha: sha,
      message: `回滚到 ${target.message || vid.slice(0, 8)}`,
      content,
      size: Buffer.byteLength(content, "utf-8"),
      createdBy: user.id,
    }).run();

    db.update(schema.documents)
      .set({ currentVersionId: newVersionId, updatedAt: new Date() })
      .where(eq(schema.documents.id, id))
      .run();

    return NextResponse.json({ versionId: newVersionId });
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
