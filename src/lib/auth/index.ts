import { cookies } from "next/headers";
import { db, schema } from "@/lib/db";
import { eq, and, gt } from "drizzle-orm";
import { genId } from "@/lib/utils";
import type { User } from "@/lib/db/schema";

const SESSION_COOKIE = "prd_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 天
const COOKIE_SECURE =
  process.env.COOKIE_SECURE?.toLowerCase() === "false"
    ? false
    : process.env.NODE_ENV === "production";

/**
 * 创建 session
 */
export async function createSession(userId: string): Promise<string> {
  const sessionId = genId();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE);

  db.insert(schema.sessions).values({
    id: sessionId,
    userId,
    expiresAt,
  }).run();

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE / 1000,
    path: "/",
  });

  return sessionId;
}

/**
 * 获取当前登录用户
 */
export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const now = new Date();
  const session = db
    .select()
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.id, sessionId),
        gt(schema.sessions.expiresAt, now)
      )
    )
    .get();

  if (!session) return null;

  const user = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .get();

  return user ?? null;
}

/**
 * 登出
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    db.delete(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .run();
  }
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * 要求登录(用于 API route 保护)
 */
export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}
