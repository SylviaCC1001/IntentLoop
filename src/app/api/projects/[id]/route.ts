import { NextRequest, NextResponse } from "next/server";
import { schema } from "@/lib/db";
import { getRequestContext } from "@/lib/tenants/server";
import { requireAuth } from "@/lib/auth";
import {
  assertCanModifySolutions,
  canManageUsers,
  forbiddenResponseMessage,
} from "@/lib/auth/permissions";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projectStatuses } from "@/lib/projects/status";

const updateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  description: z.string().nullable().optional(),
  color: z.string().optional(),
  status: z.enum(projectStatuses).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { db } = await getRequestContext();
    const { id } = await params;
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    return NextResponse.json({ project });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

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
    const project = db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    db.update(schema.projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.projects.id, id))
      .run();
    const updatedProject = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();
    return NextResponse.json({ ok: true, project: updatedProject });
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { db } = await getRequestContext();
    if (!canManageUsers(user)) {
      return NextResponse.json({ error: "仅管理员可删除" }, { status: 403 });
    }
    const { id } = await params;
    const project = db.select().from(schema.projects)
      .where(eq(schema.projects.id, id)).get();
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    db.delete(schema.projects).where(eq(schema.projects.id, id)).run();
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
