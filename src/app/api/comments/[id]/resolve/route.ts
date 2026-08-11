import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { resolveComment } from "@/lib/comments";
import {
  assertCanParticipateInReview,
  forbiddenResponseMessage,
} from "@/lib/auth/permissions";

const resolveSchema = z.object({
  resolved: z.boolean().optional(),
});

function toErrorResponse(error: unknown) {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (error instanceof Error && error.message === "COMMENT_NOT_FOUND") {
    return NextResponse.json({ error: "评论不存在" }, { status: 404 });
  }
  if (error instanceof Error) {
    const message = forbiddenResponseMessage(error);
    if (message) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    assertCanParticipateInReview(user);
    const { id } = await params;
    const data = resolveSchema.parse(await req.json().catch(() => ({})));
    const comment = resolveComment(id, data.resolved ?? true);

    return NextResponse.json({ comment });
  } catch (error) {
    return toErrorResponse(error);
  }
}
