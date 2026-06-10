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
};

export function normalizeUserRole(role: string): UserRole {
  if (role === "member") return "product";
  return userRoles.includes(role as UserRole) ? (role as UserRole) : "product";
}

export function canManageUsers(actor: RoleActor): boolean {
  return normalizeUserRole(actor.role) === "admin";
}

export function canModifySolutions(actor: RoleActor): boolean {
  return normalizeUserRole(actor.role) !== "engineering";
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

export function forbiddenResponseMessage(error: Error): string | null {
  if (error.message === "FORBIDDEN_MANAGE_USERS") return "仅管理者可操作";
  if (error.message === "FORBIDDEN_MODIFY_SOLUTION") {
    return "研发角色仅可查看、评论和参与评审，不可修改需求方案";
  }
  return null;
}
