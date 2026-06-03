"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import MarkdownPreview from "@/components/MarkdownPreview";

const STORAGE_KEY = "intentloop-joint-prd-width";
const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 280;
const MAX_WIDTH = 680;

type ResizableJointReviewLayoutProps = {
  prdTitle: string | null;
  prdContent: string;
  children: ReactNode;
};

function clampWidth(value: number) {
  return Math.min(Math.max(value, MIN_WIDTH), MAX_WIDTH);
}

export default function ResizableJointReviewLayout({
  prdTitle,
  prdContent,
  children,
}: ResizableJointReviewLayoutProps) {
  const [prdWidth, setPrdWidth] = useState(DEFAULT_WIDTH);
  const dragStartRef = useRef<{ x: number; width: number } | null>(null);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(saved)) {
      setPrdWidth(clampWidth(saved));
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(prdWidth));
  }, [prdWidth]);

  function resetWidth() {
    setPrdWidth(DEFAULT_WIDTH);
  }

  function beginDrag(event: PointerEvent<HTMLButtonElement>) {
    dragStartRef.current = { x: event.clientX, width: prdWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const start = dragStartRef.current;
    if (!start) return;
    setPrdWidth(clampWidth(start.width + event.clientX - start.x));
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    dragStartRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  function handleSeparatorKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setPrdWidth((value) => clampWidth(value - 24));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setPrdWidth((value) => clampWidth(value + 24));
    } else if (event.key === "Home") {
      event.preventDefault();
      setPrdWidth(MIN_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      setPrdWidth(MAX_WIDTH);
    } else if (event.key === "Enter") {
      event.preventDefault();
      resetWidth();
    }
  }

  return (
    <div
      data-joint-review-resizable="true"
      data-joint-prd-width={prdWidth}
      className="grid items-start overflow-x-auto"
      style={{
        gridTemplateColumns: `${prdWidth}px 12px minmax(0, 1fr)`,
      }}
    >
      <aside className="min-w-0 rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">PRD 对照</h2>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {prdTitle ?? "暂无 PRD"}
          </p>
        </div>
        <article className="max-h-[760px] overflow-y-auto bg-background px-5 py-5">
          {prdTitle ? (
            <MarkdownPreview content={prdContent} />
          ) : (
            <div className="rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-10 text-center text-sm text-muted-foreground">
              当前需求方案下还没有 PRD 文档。
            </div>
          )}
        </article>
      </aside>

      <button
        type="button"
        role="separator"
        aria-label="调整 PRD 对照宽度"
        aria-orientation="vertical"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={prdWidth}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={resetWidth}
        onKeyDown={handleSeparatorKeyDown}
        className="group flex h-[760px] cursor-col-resize items-stretch justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="my-2 w-px rounded-full bg-border group-hover:bg-primary group-focus-visible:bg-primary" />
      </button>

      <div className="min-w-0 pl-3">{children}</div>
    </div>
  );
}
