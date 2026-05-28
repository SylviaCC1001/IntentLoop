import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";

// GET /api/documents/:id/versions/:vid - 单版本详情
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; vid: string }> }
) {
  try {
    await requireAuth();
    const { vid } = await params;
    const version = db
      .select()
      .from(schema.versions)
      .where(eq(schema.versions.id, vid))
      .get();
    if (!version) {
      return NextResponse.json({ error: "版本不存在" }, { status: 404 });
    }
    return NextResponse.json({ version });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
