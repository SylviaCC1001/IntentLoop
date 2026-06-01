export type ReviewIssueStatus = "open" | "handled" | "closed" | "resolved";

export type SolutionReviewIssue = {
  id: string;
  body: string;
  status: ReviewIssueStatus;
  documentId: string;
  documentTitle: string;
  documentType: string;
  versionId: string;
  versionMessage: string;
  anchorLabel: string;
  href: string;
  createdAt: string;
  authorName: string;
};

export const reviewStatusLabels: Record<ReviewIssueStatus, string> = {
  open: "待处理",
  handled: "已处理",
  closed: "已关闭",
  resolved: "已关闭",
};
