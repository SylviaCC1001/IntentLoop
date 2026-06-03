"use client";

import { useState } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type VersionItem = {
  id: string;
  message: string | null;
  size: number;
  createdAt: Date;
  href?: string;
};

type AssetVersionSheetProps = {
  documentTitle: string;
  versions: VersionItem[];
  currentVersionId: string | null;
  selectedVersionId?: string | null;
  className?: string;
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function AssetVersionSheet({
  documentTitle,
  versions,
  currentVersionId,
  selectedVersionId,
  className,
}: AssetVersionSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" className={className} onClick={() => setOpen(true)}>
        <History className="size-3.5" />
        版本历史
        <span className="text-muted-foreground">{versions.length}</span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>版本历史</SheetTitle>
            <SheetDescription>{documentTitle} · 共 {versions.length} 个版本</SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-2 overflow-auto p-5">
            {versions.length ? (
              versions.map((version) => {
                const content = (
                  <>
                  <div className="min-w-0">
                    <div className="truncate">
                      {version.message || "未填写更新说明"}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(version.createdAt)} · {formatSize(version.size)}
                    </div>
                  </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {version.id === selectedVersionId && (
                        <Badge variant="success" className="shrink-0">
                          正在查看
                        </Badge>
                      )}
                      {version.id === currentVersionId && (
                        <Badge variant="accent" className="shrink-0">
                          当前
                        </Badge>
                      )}
                    </div>
                  </>
                );
                const className =
                  "flex items-start justify-between gap-3 rounded-md border border-border bg-background px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted";
                const href = version.href;

                return href ? (
                  <Link
                    key={version.id}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={className}
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={version.id} className={className}>
                    {content}
                  </div>
                );
              })
            ) : (
              <div className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                暂无版本记录
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
