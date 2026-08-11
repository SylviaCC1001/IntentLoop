import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { genId } from "@/lib/utils";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import type { CommentAnchor } from "@/lib/db/schema";
import {
  assertCanParticipateInReview,
  forbiddenResponseMessage,
} from "@/lib/auth/permissions";

const anchorSchema: z.ZodType<CommentAnchor> = z.union([
  z.object({ type: z.literal("doc") }),
  z.object({
    type: z.literal("block"),
    blockId: z.string(),
    textHash: z.string(),
    preview: z.string(),
  }),
  z.object({
    type: z.literal("element"),
    selector: z.string(),
    textHash: z.string(),
    preview: z.string(),
    kind: z.enum(["selection", "prototype-rect", "prototype-element"]).optional(),
    blockId: z.string().optional(),
    selectedText: z.string().optional(),
    startOffset: z.number().int().nonnegative().optional(),
    endOffset: z.number().int().nonnegative().optional(),
    pagePath: z.string().optional(),
    viewKey: z.string().optional(),
    pageKey: z.string().optional(),
    viewport: z
      .object({
        w: z.number().positive(),
        h: z.number().positive(),
      })
      .optional(),
    bbox: z
      .object({
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
      })
      .optional(),
    domAnchor: z
      .object({
        selector: z.string(),
        xpath: z.string().optional(),
        tagName: z.string(),
        id: z.string().optional(),
        className: z.string().optional(),
        role: z.string().optional(),
        text: z.string().optional(),
        fingerprint: z.string(),
      })
      .optional(),
  }),
]);

const createSchema = z.object({
  versionId: z.string(),
  parentId: z.string().nullable().optional(),
  anchor: anchorSchema,
  body: z.string().min(1).max(2000),
});

// GET /api/documents/:id/comments?version=xxx
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const versionId = searchParams.get("version");

    const conditions = [eq(schema.comments.documentId, id)];
    if (versionId) {
      conditions.push(eq(schema.comments.versionId, versionId));
    }

    const list = db
      .select()
      .from(schema.comments)
      .where(and(...conditions))
      .orderBy(desc(schema.comments.createdAt))
      .all();

    // 查关联用户信息
    const userIds = [...new Set(list.map((c) => c.createdBy))];
    const users = userIds.length
      ? db.select().from(schema.users).all().filter((u) => userIds.includes(u.id))
      : [];
    const userMap = Object.fromEntries(
      users.map((u) => [
        u.id,
        { id: u.id, displayName: u.displayName, avatarColor: u.avatarColor },
      ])
    );

    return NextResponse.json({ comments: list, users: userMap });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// POST /api/documents/:id/comments
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    assertCanParticipateInReview(user);
    const { id } = await params;
    const body = await req.json();
    const data = createSchema.parse(body);

    const commentId = genId();
    db.insert(schema.comments).values({
      id: commentId,
      documentId: id,
      versionId: data.versionId,
      parentId: data.parentId || null,
      anchorType: data.anchor.type,
      anchorData: data.anchor,
      body: data.body,
      createdBy: user.id,
    }).run();

    const c = db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.id, commentId))
      .get();

    return NextResponse.json({ comment: c }, { status: 201 });
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
