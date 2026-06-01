import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  formatReviewContextMarkdown,
  getSolutionReviewData,
} from "@/lib/solution-review";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;
    const data = getSolutionReviewData(id);
    if (!data) {
      return NextResponse.json({ error: "需求方案不存在" }, { status: 404 });
    }

    const url = new URL(req.url);
    if (url.searchParams.get("format") === "json") {
      return NextResponse.json(data);
    }

    const markdown = formatReviewContextMarkdown(data);
    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="review-context-${id}.md"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    console.error(error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
