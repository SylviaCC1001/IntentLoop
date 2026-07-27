import fs from "fs";
import path from "path";

const smokeDataDir = path.join(process.cwd(), "data", "permissions-smoke");
fs.rmSync(smokeDataDir, { recursive: true, force: true });
process.env.DATA_DIR = smokeDataDir;

async function main() {
  const { eq } = await import("drizzle-orm");
  const { genId } = await import("../utils");
  await import("../db/migrate");
  const { db, schema } = await import("../db");
  const {
    canManageUsers,
    canDownloadAssets,
    canModifySolutions,
    canParticipateInReview,
    normalizeUserRole,
    roleLabels,
  } = await import("./permissions");
  const {
    getProjectReadSummaries,
    recordProjectRead,
  } = await import("../project-reads");

  const roles = [
    ["admin-user", "admin", true, true, true, true, "管理者"],
    ["product-user", "product", false, true, true, true, "产品"],
    ["engineering-user", "engineering", false, false, true, true, "研发"],
    ["design-user", "design", false, true, true, true, "设计"],
    ["visitor-user", "visitor", false, false, false, false, "访客"],
  ] as const;

  for (const [id, role] of roles) {
    db.insert(schema.users)
      .values({
        id,
        email: `${id}@example.local`,
        passwordHash: "hash",
        displayName: id,
        avatarColor: "#6366f1",
        role,
      })
      .run();
  }

  for (const [
    id,
    role,
    canManage,
    canModify,
    canReview,
    canDownload,
    label,
  ] of roles) {
    const user = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .get();

    if (!user) throw new Error(`Missing user ${id}`);
    if (normalizeUserRole(user.role) !== role) {
      throw new Error(`Expected ${role} to normalize to itself`);
    }
    if (canManageUsers(user) !== canManage) {
      throw new Error(`Expected ${role} canManageUsers=${canManage}`);
    }
    if (canModifySolutions(user) !== canModify) {
      throw new Error(`Expected ${role} canModifySolutions=${canModify}`);
    }
    if (canParticipateInReview(user) !== canReview) {
      throw new Error(`Expected ${role} canParticipateInReview=${canReview}`);
    }
    if (canDownloadAssets(user) !== canDownload) {
      throw new Error(`Expected ${role} canDownloadAssets=${canDownload}`);
    }
    if (roleLabels[role] !== label) {
      throw new Error(`Expected ${role} label to be ${label}`);
    }
  }

  if (normalizeUserRole("member") !== "product") {
    throw new Error("Expected legacy member role to normalize to product");
  }
  if (normalizeUserRole("unknown-role") !== "visitor") {
    throw new Error("Expected unknown roles to fall back to visitor");
  }

  const projectId = genId();
  db.insert(schema.projects)
    .values({
      id: projectId,
      name: "Permission Read Smoke",
      color: "#6366f1",
      createdBy: "product-user",
    })
    .run();

  recordProjectRead(projectId, "engineering-user");
  recordProjectRead(projectId, "engineering-user");
  recordProjectRead(projectId, "design-user");
  recordProjectRead(projectId, "visitor-user");

  const summaries = getProjectReadSummaries(projectId);
  const engineering = summaries.find((item) => item.userId === "engineering-user");
  const product = summaries.find((item) => item.userId === "product-user");
  const visitor = summaries.find((item) => item.userId === "visitor-user");

  if (!engineering?.hasRead || engineering.readCount !== 2 || !engineering.lastReadAt) {
    throw new Error("Expected engineering read summary to track repeated views");
  }
  if (!product || product.hasRead || product.readCount !== 0 || product.lastReadAt !== null) {
    throw new Error("Expected unread users to appear in read summaries");
  }
  if (!visitor?.hasRead || visitor.readCount !== 1 || !visitor.lastReadAt) {
    throw new Error("Expected visitor page views to remain in read summaries");
  }

  console.log("Permissions smoke test passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
