import fs from "fs";
import path from "path";

const smokeDataDir = path.join(process.cwd(), "data", "smoke-test");
fs.rmSync(smokeDataDir, { recursive: true, force: true });
process.env.DATA_DIR = smokeDataDir;

async function main() {
  const { eq } = await import("drizzle-orm");
  await import("./migrate");
  const { db, schema } = await import("./index");

  db.insert(schema.users)
    .values({
      id: "smoke-user",
      email: "smoke@example.local",
      passwordHash: "hash",
      displayName: "Smoke User",
      avatarColor: "#0f766e",
      role: "admin",
    })
    .run();

  const user = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, "smoke-user"))
    .get();

  if (!user || user.email !== "smoke@example.local") {
    throw new Error("DB smoke test failed to read inserted user");
  }

  console.log("DB smoke test passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
