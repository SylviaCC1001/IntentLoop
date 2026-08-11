import { userRoles, type UserRole } from "@/lib/db/schema";

export { userRoles };

type RoleActor = {
  role: string;
};

export const roleLabels: Record<UserRole, string> = {
  admin: "管理者",
  product: "产品",
  engineering: "研发",
  design: "设计",
  visitor: "访客",
};

export function normalizeUserRole(role: string): UserRole {
  if (role === "member") return "product";
  return userRoles.includes(role as UserRole) ? (role as UserRole) : "visitor";
}

export function canManageUsers(actor: RoleActor): boolean {
  return normalizeUserRole(actor.role) === "admin";
}

export function canModifySolutions(actor: RoleActor): boolean {
  const role = normalizeUserRole(actor.role);
  return role === "admin" || role === "product" || role === "design";
}

export function canParticipateInReview(actor: RoleActor): boolean {
  return normalizeUserRole(actor.role) !== "visitor";
}

export function canDownloadAssets(actor: RoleActor): boolean {
  return normalizeUserRole(actor.role) !== "visitor";
}

export function assertCanManageUsers(actor: RoleActor): void {
  if (!canManageUsers(actor)) {
    throw new Error("FORBIDDEN_MANAGE_USERS");
  }
}

export function assertCanModifySolutions(actor: RoleActor): void {
  if (!canModifySolutions(actor)) {
    throw new Error("FORBIDDEN_MODIFY_SOLUTION");
  }
}

export function assertCanParticipateInReview(actor: RoleActor): void {
  if (!canParticipateInReview(actor)) {
    throw new Error("FORBIDDEN_PARTICIPATE_REVIEW");
  }
}

export function assertCanDownloadAssets(actor: RoleActor): void {
  if (!canDownloadAssets(actor)) {
    throw new Error("FORBIDDEN_DOWNLOAD_ASSET");
  }
}

export function forbiddenResponseMessage(error: Error): string | null {
  if (error.message === "FORBIDDEN_MANAGE_USERS") return "仅管理者可操作";
  if (error.message === "FORBIDDEN_MODIFY_SOLUTION") {
    return "研发角色仅可查看、评论和参与评审，不可修改需求方案";
  }
  if (error.message === "FORBIDDEN_PARTICIPATE_REVIEW") {
    return "访客角色仅可查看，不可参与评审";
  }
  if (error.message === "FORBIDDEN_DOWNLOAD_ASSET") {
    return "访客角色仅可查看，不可下载或导出资料";
  }
  return null;
}
