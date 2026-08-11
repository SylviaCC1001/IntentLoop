export const projectStatuses = ["draft", "reviewed", "revised"] as const;

export type ProjectStatus = (typeof projectStatuses)[number];

export const projectStatusLabels: Record<ProjectStatus, string> = {
  draft: "起草中",
  reviewed: "已评审",
  revised: "新修订",
};
