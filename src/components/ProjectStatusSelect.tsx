"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  projectStatusLabels,
  projectStatuses,
  type ProjectStatus,
} from "@/lib/projects/status";

const statusStyles: Record<ProjectStatus, string> = {
  draft: "border-transparent bg-muted text-muted-foreground",
  reviewed:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300",
  revised:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300",
};

type ProjectStatusSelectProps = {
  projectId: string;
  projectName: string;
  status: ProjectStatus;
};

export default function ProjectStatusSelect({
  projectId,
  projectName,
  status,
}: ProjectStatusSelectProps) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState(status);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setCurrentStatus(status);
  }, [status]);

  async function updateStatus(nextStatus: ProjectStatus) {
    if (nextStatus === currentStatus) return;
    const previousStatus = currentStatus;
    setCurrentStatus(nextStatus);
    setLoading(true);

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCurrentStatus(previousStatus);
        alert(data.error || "状态更新失败");
        return;
      }
      router.refresh();
    } catch {
      setCurrentStatus(previousStatus);
      alert("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="relative inline-flex shrink-0">
      <select
        data-project-status-control={projectId}
        aria-label={`修改 ${projectName} 的状态`}
        value={currentStatus}
        disabled={loading}
        onChange={(event) => updateStatus(event.target.value as ProjectStatus)}
        className={cn(
          "h-6 cursor-pointer appearance-none rounded-sm border py-0 pl-2 pr-6 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70",
          statusStyles[currentStatus]
        )}
      >
        {projectStatuses.map((item) => (
          <option key={item} value={item}>
            {projectStatusLabels[item]}
          </option>
        ))}
      </select>
      {loading ? (
        <Loader2 className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 animate-spin" />
      ) : (
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2" />
      )}
    </span>
  );
}
