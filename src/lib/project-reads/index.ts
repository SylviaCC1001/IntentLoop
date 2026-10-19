import { desc, eq, sql } from "drizzle-orm";
import { schema, type TenantDatabase } from "@/lib/db";
import { genId } from "@/lib/utils";
import { normalizeUserRole, roleLabels } from "@/lib/auth/permissions";

export type ProjectReadSummary = {
  userId: string;
  displayName: string;
  avatarColor: string;
  role: string;
  roleLabel: string;
  hasRead: boolean;
  readCount: number;
  firstReadAt: Date | null;
  lastReadAt: Date | null;
};

export function recordProjectRead(db: TenantDatabase, projectId: string, userId: string) {
  const now = new Date();

  db.insert(schema.projectReads)
    .values({
      id: genId(),
      projectId,
      userId,
      readCount: 1,
      firstReadAt: now,
      lastReadAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.projectReads.projectId, schema.projectReads.userId],
      set: {
        readCount: sql`${schema.projectReads.readCount} + 1`,
        lastReadAt: now,
      },
    })
    .run();
}

export function getProjectReadSummaries(db: TenantDatabase, projectId: string): ProjectReadSummary[] {
  const users = db.select().from(schema.users).orderBy(desc(schema.users.createdAt)).all();
  const reads = db
    .select()
    .from(schema.projectReads)
    .where(eq(schema.projectReads.projectId, projectId))
    .all();
  const readMap = new Map(reads.map((read) => [read.userId, read]));

  return users
    .map((user) => {
      const read = readMap.get(user.id);
      const role = normalizeUserRole(user.role);
      return {
        userId: user.id,
        displayName: user.displayName,
        avatarColor: user.avatarColor,
        role,
        roleLabel: roleLabels[role],
        hasRead: Boolean(read),
        readCount: read?.readCount ?? 0,
        firstReadAt: read?.firstReadAt ?? null,
        lastReadAt: read?.lastReadAt ?? null,
      };
    })
    .sort((left, right) => {
      if (left.hasRead !== right.hasRead) return left.hasRead ? -1 : 1;
      const leftTime = left.lastReadAt?.getTime() ?? 0;
      const rightTime = right.lastReadAt?.getTime() ?? 0;
      if (leftTime !== rightTime) return rightTime - leftTime;
      return left.displayName.localeCompare(right.displayName, "zh-CN");
    });
}

export function getProjectReadCounts(db: TenantDatabase) {
  const reads = db.select().from(schema.projectReads).all();
  const counts = new Map<string, number>();
  for (const read of reads) {
    counts.set(read.projectId, (counts.get(read.projectId) ?? 0) + 1);
  }
  return counts;
}
