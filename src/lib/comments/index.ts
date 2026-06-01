import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Comment } from "@/lib/db/schema";

type CommentActor = {
  id: string;
  role: string;
};

type CommentUpdate = {
  body?: string;
  status?: "open" | "handled" | "closed" | "resolved";
};

function getCommentOrThrow(id: string): Comment {
  const comment = db
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.id, id))
    .get();

  if (!comment) {
    throw new Error("COMMENT_NOT_FOUND");
  }

  return comment;
}

function assertCanManageComment(comment: Comment, actor: CommentActor) {
  if (actor.role === "admin" || comment.createdBy === actor.id) {
    return;
  }

  throw new Error("COMMENT_FORBIDDEN");
}

export function updateComment(
  id: string,
  actor: CommentActor,
  update: CommentUpdate
): Comment {
  const comment = getCommentOrThrow(id);
  assertCanManageComment(comment, actor);

  const changes: CommentUpdate = {};
  if (update.body !== undefined) {
    changes.body = update.body;
  }
  if (update.status !== undefined) {
    changes.status = update.status;
  }

  if (Object.keys(changes).length > 0) {
    db.update(schema.comments)
      .set(changes)
      .where(eq(schema.comments.id, id))
      .run();
  }

  return getCommentOrThrow(id);
}

export function resolveComment(id: string, resolved = true): Comment {
  getCommentOrThrow(id);

  db.update(schema.comments)
    .set({ status: resolved ? "resolved" : "open" })
    .where(eq(schema.comments.id, id))
    .run();

  return getCommentOrThrow(id);
}

export function deleteComment(id: string, actor: CommentActor) {
  const comment = getCommentOrThrow(id);
  assertCanManageComment(comment, actor);

  db.delete(schema.comments)
    .where(eq(schema.comments.parentId, id))
    .run();
  db.delete(schema.comments)
    .where(eq(schema.comments.id, id))
    .run();
}
