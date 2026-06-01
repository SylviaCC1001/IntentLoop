import fs from "fs";
import path from "path";

const smokeDataDir = path.join(process.cwd(), "data", "comments-smoke-test");
fs.rmSync(smokeDataDir, { recursive: true, force: true });
process.env.DATA_DIR = smokeDataDir;

async function main() {
  const { eq } = await import("drizzle-orm");
  await import("../db/migrate");
  const { db, schema } = await import("../db");
  const {
    deleteComment,
    resolveComment,
    updateComment,
  } = await import("./index");

  const now = new Date();
  db.insert(schema.users)
    .values([
      {
        id: "owner",
        email: "owner@example.local",
        passwordHash: "hash",
        displayName: "Owner",
        avatarColor: "#2563eb",
        role: "member",
      },
      {
        id: "reviewer",
        email: "reviewer@example.local",
        passwordHash: "hash",
        displayName: "Reviewer",
        avatarColor: "#0f766e",
        role: "member",
      },
    ])
    .run();

  db.insert(schema.projects)
    .values({
      id: "project",
      name: "Project",
      createdBy: "owner",
      createdAt: now,
      updatedAt: now,
    })
    .run();

  db.insert(schema.documents)
    .values({
      id: "doc",
      projectId: "project",
      title: "Doc",
      type: "md",
      ownerId: "owner",
      createdAt: now,
      updatedAt: now,
    })
    .run();

  db.insert(schema.versions)
    .values({
      id: "version",
      documentId: "doc",
      message: "Initial",
      content: "# Doc",
      createdBy: "owner",
      createdAt: now,
    })
    .run();

  db.insert(schema.comments)
    .values({
      id: "comment",
      documentId: "doc",
      versionId: "version",
      anchorType: "doc",
      anchorData: { type: "doc" },
      body: "Original",
      createdBy: "owner",
      createdAt: now,
    })
    .run();

  const updated = updateComment("comment", { id: "owner", role: "member" }, {
    body: "Updated",
  });
  if (updated.body !== "Updated") {
    throw new Error("Expected owner to update comment body");
  }

  let forbidden = false;
  try {
    updateComment("comment", { id: "reviewer", role: "member" }, {
      body: "Nope",
    });
  } catch (error) {
    forbidden = error instanceof Error && error.message === "COMMENT_FORBIDDEN";
  }
  if (!forbidden) {
    throw new Error("Expected non-owner member update to be forbidden");
  }

  const resolved = resolveComment("comment", true);
  if (resolved.status !== "resolved") {
    throw new Error("Expected comment to resolve");
  }

  deleteComment("comment", { id: "owner", role: "member" });
  const deleted = db
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.id, "comment"))
    .get();
  if (deleted) {
    throw new Error("Expected owner delete to remove comment");
  }

  console.log("Comment smoke test passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
