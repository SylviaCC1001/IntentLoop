import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  assertCanModifySolutions,
  forbiddenResponseMessage,
} from "@/lib/auth/permissions";
import { genId } from "@/lib/utils";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().optional(),
  color: z.string().optional(),
});

// GET /api/projects - 列出所有项目
export async function GET() {
  try {
    await requireAuth();
    const projects = db
      .select()
      .from(schema.projects)
      .orderBy(desc(schema.projects.updatedAt))
      .all();
    return NextResponse.json({ projects });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// POST /api/projects - 创建项目
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    assertCanModifySolutions(user);
    const body = await req.json();
    const { name, description, color } = createSchema.parse(body);

    const id = genId();
    db.insert(schema.projects).values({
      id,
      name,
      description: description || null,
      color: color || "#6366f1",
      createdBy: user.id,
    }).run();

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();

    return NextResponse.json({ project }, { status: 201 });
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
