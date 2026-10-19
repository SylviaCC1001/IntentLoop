import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { schema } from "@/lib/db";
import { getRequestContext } from "@/lib/tenants/server";
import {
  assertCanManageUsers,
  forbiddenResponseMessage,
  userRoles,
} from "@/lib/auth/permissions";

const updateSchema = z.object({
  role: z.enum(userRoles),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth();
    const { db } = await getRequestContext();
    assertCanManageUsers(actor);
    const { id } = await params;
    const data = updateSchema.parse(await req.json());

    const target = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .get();
    if (!target) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }
    if (target.id === actor.id && data.role !== "admin") {
      return NextResponse.json(
        { error: "不能移除自己的管理者权限" },
        { status: 400 }
      );
    }

    db.update(schema.users)
      .set({ role: data.role })
      .where(eq(schema.users.id, id))
      .run();

    const user = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .get();

    return NextResponse.json({ user });
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
      return NextResponse.json(
        { error: "参数错误", detail: e.errors },
        { status: 400 }
      );
    }
    console.error(e);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
