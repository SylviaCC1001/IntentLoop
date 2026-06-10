import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, count } from "drizzle-orm";
import { createSession } from "@/lib/auth";
import { genId, hashPassword, randomAvatarColor } from "@/lib/utils";
import { z } from "zod";

const registerSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(32),
  password: z.string().min(6),
  inviteCode: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, displayName, password, inviteCode } =
      registerSchema.parse(body);

    // 校验邀请码
    const expectedCode = process.env.INVITE_CODE || "PRD2026";
    if (inviteCode !== expectedCode) {
      return NextResponse.json({ error: "邀请码错误" }, { status: 403 });
    }

    // 检查邮箱
    const existing = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .get();
    if (existing) {
      return NextResponse.json({ error: "邮箱已被注册" }, { status: 409 });
    }

    // 第一个用户=管理者，后续默认产品角色
    const userCountResult = db
      .select({ c: count() })
      .from(schema.users)
      .get();
    const isFirst = (userCountResult?.c ?? 0) === 0;

    const id = genId();
    const passwordHash = await hashPassword(password);

    db.insert(schema.users).values({
      id,
      email: email.toLowerCase(),
      passwordHash,
      displayName,
      avatarColor: randomAvatarColor(),
      role: isFirst ? "admin" : "product",
    }).run();

    await createSession(id);

    return NextResponse.json({
      user: {
        id,
        email: email.toLowerCase(),
        displayName,
        role: isFirst ? "admin" : "product",
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
