import { NextRequest, NextResponse } from "next/server";
import { getTenantDatabase, schema } from "@/lib/db";
import { getTenant } from "@/lib/tenants";
import { eq, count } from "drizzle-orm";
import { createSession } from "@/lib/auth";
import { genId, hashPassword, randomAvatarColor } from "@/lib/utils";
import { z } from "zod";

const registerSchema = z.object({
  tenantId: z.enum(["cowork", "procurement"]),
  email: z.string().email(),
  displayName: z.string().min(1).max(32),
  password: z.string().min(6),
  inviteCode: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, displayName, password, inviteCode, tenantId } =
      registerSchema.parse(body);
    const db = getTenantDatabase(tenantId);

    // 校验邀请码
    const expectedCode = tenantId === "cowork"
      ? process.env.COWORK_INVITE_CODE || process.env.INVITE_CODE
      : process.env.PROCUREMENT_INVITE_CODE;
    if (!expectedCode || inviteCode !== expectedCode) {
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

    const id = genId();
    const passwordHash = await hashPassword(password);
    // Serialize first-admin assignment within this space.
    const isFirst = db.transaction((tx) => {
      const first = (tx.select({ c: count() }).from(schema.users).get()?.c ?? 0) === 0;
      tx.insert(schema.users).values({
        id,
        email: email.toLowerCase(),
        passwordHash,
        displayName,
        avatarColor: randomAvatarColor(),
        role: first ? "admin" : "product",
      }).run();
      return first;
    }, { behavior: "immediate" });

    await createSession(id, tenantId);

    return NextResponse.json({
      tenant: getTenant(tenantId),
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
