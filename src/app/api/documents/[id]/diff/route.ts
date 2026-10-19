import { NextRequest, NextResponse } from "next/server";
import { schema } from "@/lib/db";
import { getRequestContext } from "@/lib/tenants/server";
import { requireAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { diffLines } from "diff";

// GET /api/documents/:id/diff?from=v1&to=v2
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { db } = await getRequestContext();
    await params; // id 暂未直接用,通过 from/to 查
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (!from || !to) {
      return NextResponse.json({ error: "缺少 from/to 参数" }, { status: 400 });
    }

    const fromV = db
      .select()
      .from(schema.versions)
      .where(eq(schema.versions.id, from))
      .get();
    const toV = db
      .select()
      .from(schema.versions)
      .where(eq(schema.versions.id, to))
      .get();
    if (!fromV || !toV) {
      return NextResponse.json({ error: "版本不存在" }, { status: 404 });
    }

    const diff = diffLines(fromV.content || "", toV.content || "");
    return NextResponse.json({
      from: { id: fromV.id, message: fromV.message, createdAt: fromV.createdAt },
      to: { id: toV.id, message: toV.message, createdAt: toV.createdAt },
      diff,
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
