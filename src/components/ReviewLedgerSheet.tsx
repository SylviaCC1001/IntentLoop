"use client";

import { useState } from "react";
import { ClipboardList } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import ReviewIssueLedger from "@/components/ReviewIssueLedger";
import type { SolutionReviewIssue } from "@/lib/solution-review/types";

type ReviewLedgerSheetProps = {
  issues: SolutionReviewIssue[];
  openCount: number;
  compact?: boolean;
};

export default function ReviewLedgerSheet({
  issues,
  openCount,
  compact = false,
}: ReviewLedgerSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        data-review-issue-ledger="trigger"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
            : "inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm transition-colors hover:border-primary hover:bg-muted"
        }
      >
        <ClipboardList className="size-4 text-muted-foreground" />
        <span>{compact ? "评审台账" : "评审问题台账"}</span>
        {!compact &&
          (openCount > 0 ? (
            <Badge variant="warning">{openCount} 待处理</Badge>
          ) : (
            <Badge variant="secondary">{issues.length}</Badge>
          ))}
      </button>

      {open && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="right" className="w-full sm:max-w-xl">
            <SheetHeader>
              <SheetTitle>评审问题台账</SheetTitle>
              <SheetDescription>
                汇总 PRD 与原型上的评审意见，集中推进处理状态。
              </SheetDescription>
            </SheetHeader>
            <ReviewIssueLedger issues={issues} embedded />
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
