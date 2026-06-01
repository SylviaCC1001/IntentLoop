import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { deleteComment, updateComment } from "@/lib/comments";

const updateSchema = z.object({
  body: z.string().min(1).max(2000).optional(),
  status: z.enum(["open", "handled", "closed", "resolved"]).optional(),
});

function toErrorResponse(error: unknown) {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (error instanceof Error && error.message === "COMMENT_NOT_FOUND") {
    return NextResponse.json({ error: "评论不存在" }, { status: 404 });
  }
  if (error instanceof Error && error.message === "COMMENT_FORBIDDEN") {
    return NextResponse.json({ error: "无权操作该评论" }, { status: 403 });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: "参数错误", detail: error.errors },
      { status: 400 }
    );
  }

  console.error(error);
  return NextResponse.json({ error: "服务器错误" }, { status: 500 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const data = updateSchema.parse(await req.json());
    const comment = updateComment(id, user, data);

    return NextResponse.json({ comment });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    deleteComment(id, user);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
