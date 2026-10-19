import { NextRequest, NextResponse } from "next/server";
import { schema } from "@/lib/db";
import { getRequestContext } from "@/lib/tenants/server";
import { requireAuth } from "@/lib/auth";
import {
  assertCanModifySolutions,
  forbiddenResponseMessage,
} from "@/lib/auth/permissions";
import { genId } from "@/lib/utils";
import { eq } from "drizzle-orm";
import { z } from "zod";
import path from "path";
import fs from "fs";

const updateSchema = z.object({
  title: z.string().min(1).max(128).optional(),
  description: z.string().nullable().optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(["draft", "reviewing", "published", "archived"]).optional(),
});

// GET /api/documents/:id - 获取文档详情(含当前版本)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { db } = await getRequestContext();
    const { id } = await params;
    const doc = db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, id))
      .get();
    if (!doc) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }
    let version = null;
    if (doc.currentVersionId) {
      version = db
        .select()
        .from(schema.versions)
        .where(eq(schema.versions.id, doc.currentVersionId))
        .get();
    }
    return NextResponse.json({ document: doc, currentVersion: version });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// PATCH /api/documents/:id - 更新元数据(标题/优先级/标签/状态)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { db } = await getRequestContext();
    assertCanModifySolutions(user);
    const { id } = await params;
    const body = await req.json();
    const data = updateSchema.parse(body);
    const before = db.select().from(schema.documents)
      .where(eq(schema.documents.id, id)).get();
    if (!before) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }

    // 状态变更要记日志
    if (data.status) {
      if (before.status !== data.status) {
        db.insert(schema.statusLogs).values({
          id: genId(),
          documentId: id,
          fromStatus: before.status,
          toStatus: data.status,
          changedBy: user.id,
        }).run();
      }
    }

    db.update(schema.documents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.documents.id, id))
      .run();
    return NextResponse.json({ ok: true });
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
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// DELETE /api/documents/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { db, dataDir } = await getRequestContext();
    assertCanModifySolutions(user);
    const { id } = await params;
    const document = db.select().from(schema.documents)
      .where(eq(schema.documents.id, id)).get();
    if (!document) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }

    // 删除文件系统中的原型目录
    const protoDir = path.join(dataDir, "prototypes", id);
    if (fs.existsSync(protoDir)) {
      fs.rmSync(protoDir, { recursive: true, force: true });
    }
    const repoDir = path.join(dataDir, "repos", id);
    if (fs.existsSync(repoDir)) {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }

    db.delete(schema.documents).where(eq(schema.documents.id, id)).run();
    return NextResponse.json({ ok: true });
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
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
