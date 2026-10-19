import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq, gt, lte } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getTenantDatabase, schema } from "@/lib/db";
import { getTenant } from "@/lib/tenants";
import { getTenantPaths } from "@/lib/tenants/storage";
import { getRequestContext } from "@/lib/tenants/server";
import { servePrototype } from "@/lib/prototypes/serve";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const now = new Date();
  if (path[0] === "~") {
    const [, tenantId, grantId, documentId, versionId, ...filePath] = path;
    const tenant = getTenant(tenantId);
    if (!tenant || !grantId || !documentId || !versionId) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }
    const db = getTenantDatabase(tenant.id);
    const grant = db.select({ id: schema.prototypeGrants.id })
      .from(schema.prototypeGrants)
      .innerJoin(schema.sessions, eq(schema.sessions.id, schema.prototypeGrants.sessionId))
      .where(and(
        eq(schema.prototypeGrants.id, grantId),
        eq(schema.prototypeGrants.documentId, documentId),
        eq(schema.prototypeGrants.versionId, versionId),
        gt(schema.prototypeGrants.expiresAt, now),
        gt(schema.sessions.expiresAt, now)
      )).get();
    if (!grant) return NextResponse.json({ error: "预览授权已失效，请刷新预览" }, { status: 401 });
    return servePrototype(req, {
      params: Promise.resolve({ path: [documentId, versionId, ...filePath] }),
    }, getTenantPaths(tenant.id).dataDir);
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { db, tenant } = await getRequestContext();
  const [documentId, versionId] = path;
  if (!documentId || !versionId) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
  const document = db.select().from(schema.documents)
    .where(eq(schema.documents.id, documentId)).get();
  const version = db.select().from(schema.versions)
    .where(and(eq(schema.versions.id, versionId), eq(schema.versions.documentId, documentId))).get();
  if (!document || !["html", "html-zip"].includes(document.type) || !version) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
  // Opaque-origin iframe subresources cannot rely on the application's cookies.
  // Keep the full session credential server-side; grant only this version for 15 minutes.
  const sessionId = (await cookies()).get("prd_session")!.value;
  db.delete(schema.prototypeGrants).where(lte(schema.prototypeGrants.expiresAt, now)).run();
  const grantId = randomBytes(32).toString("base64url");
  db.insert(schema.prototypeGrants).values({
    id: grantId,
    sessionId,
    documentId,
    versionId,
    expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
  }).run();
  const segments = ["~", tenant.id, grantId, ...path].map(encodeURIComponent);
  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: `/proto/${segments.join("/")}${new URL(req.url).search}`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
