import fs from "fs";
import path from "path";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";

const textContentTypes: Record<string, string> = {
  md: "text/markdown; charset=utf-8",
  html: "text/html; charset=utf-8",
  "html-zip": "text/html; charset=utf-8",
};

function safeFilename(value: string) {
  const cleaned = value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "document";
}

function extensionForType(type: string) {
  if (type === "md") return ".md";
  return ".html";
}

function contentDisposition(filename: string) {
  const fallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function readStoredPrototype(storagePath: string) {
  const dataDir = path.resolve(process.env.DATA_DIR || "./data");
  const prototypesDir = path.resolve(dataDir, "prototypes");
  const filePath = path.resolve(prototypesDir, ...storagePath.split("/"));
  const relativePath = path.relative(prototypesDir, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; vid: string }> }
) {
  try {
    await requireAuth();
    const { id, vid } = await params;
    const document = db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, id))
      .get();
    if (!document || !["md", "html", "html-zip"].includes(document.type)) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }

    const version = db
      .select()
      .from(schema.versions)
      .where(and(eq(schema.versions.id, vid), eq(schema.versions.documentId, id)))
      .get();
    if (!version) {
      return NextResponse.json({ error: "版本不存在" }, { status: 404 });
    }

    const body =
      version.content !== null
        ? Buffer.from(version.content, "utf-8")
        : version.storagePath
          ? readStoredPrototype(version.storagePath)
          : null;
    if (!body) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    const filename = `${safeFilename(document.title)}-${version.id.slice(0, 8)}${extensionForType(document.type)}`;
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": textContentTypes[document.type] ?? "application/octet-stream",
        "Content-Disposition": contentDisposition(filename),
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    console.error(e);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
