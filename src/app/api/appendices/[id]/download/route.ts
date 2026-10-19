import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  assertCanDownloadAssets,
  forbiddenResponseMessage,
} from "@/lib/auth/permissions";
import { schema } from "@/lib/db";
import { getRequestContext } from "@/lib/tenants/server";

const contentTypes: Record<string, string> = {
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".csv": "text/csv; charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
};

function filenameFromStoragePath(storagePath: string) {
  return path.basename(storagePath).replace(/["\r\n]/g, "_") || "appendix.bin";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { db, dataDir } = await getRequestContext();
    assertCanDownloadAssets(user);
    const { id } = await params;
    const appendix = db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, id))
      .get();
    if (!appendix || appendix.type !== "appendix" || !appendix.currentVersionId) {
      return NextResponse.json({ error: "附录不存在" }, { status: 404 });
    }

    const version = db
      .select()
      .from(schema.versions)
      .where(eq(schema.versions.id, appendix.currentVersionId))
      .get();
    if (!version?.storagePath) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    const rootDir = path.resolve(dataDir);
    const filePath = path.resolve(rootDir, ...version.storagePath.split("/"));
    const relativePath = path.relative(dataDir, filePath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      return NextResponse.json({ error: "非法路径" }, { status: 400 });
    }
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    const ext = path.extname(filePath).toLowerCase();
    const body = fs.readFileSync(filePath);
    const filename = filenameFromStoragePath(version.storagePath);

    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": contentTypes[ext] ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
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
    console.error(e);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
