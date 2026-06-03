"use client";

import { useEffect, useLayoutEffect, useRef, useState, ReactNode } from "react";
import { MoreHorizontal, Loader2, AlertTriangle } from "lucide-react";
import ClientPortal from "./ClientPortal";

export type ActionItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect?: () => void | Promise<void>;
  href?: string;
  download?: boolean;
  danger?: boolean;
  confirmTitle?: string;
  confirmDescription?: string;
  confirmLabel?: string;
};

type ActionsMenuProps = {
  items: ActionItem[];
  ariaLabel?: string;
  className?: string;
};

export default function ActionsMenu({
  items,
  ariaLabel = "更多操作",
  className,
}: ActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<ActionItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function updateMenuPosition() {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const menuWidth = 176;
    const margin = 8;
    setMenuPosition({
      top: rect.bottom + 6,
      left: Math.max(margin, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - margin)),
    });
  }

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    function handleWindowChange() {
      updateMenuPosition();
    }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (open) updateMenuPosition();
  }, [open]);

  async function runItem(item: ActionItem) {
    if (item.danger) {
      setConfirm(item);
      setOpen(false);
      return;
    }
    setOpen(false);
    await item.onSelect?.();
  }

  async function runConfirmed() {
    if (!confirm?.onSelect) return;
    setLoading(true);
    try {
      await confirm.onSelect();
      setConfirm(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div ref={containerRef} className={`relative ${className ?? ""}`}>
        <button
          ref={buttonRef}
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen((value) => !value);
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      {open && (
        <ClientPortal>
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-50 min-w-44 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-elev-3"
            style={{ top: menuPosition.top, left: menuPosition.left }}
            onClick={(event) => event.stopPropagation()}
          >
            {items.map((item) => {
              const className = `flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                item.danger
                  ? "text-destructive hover:bg-destructive/10"
                  : "hover:bg-muted"
              }`;
              if (item.href) {
                return (
                  <a
                    key={item.key}
                    href={item.href}
                    download={item.download}
                    role="menuitem"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpen(false);
                    }}
                    className={className}
                  >
                    {item.icon}
                    {item.label}
                  </a>
                );
              }

              return (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    runItem(item);
                  }}
                  className={className}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
          </div>
        </ClientPortal>
      )}

      {confirm && (
        <ClientPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            onClick={(event) => {
              event.stopPropagation();
              if (!loading) setConfirm(null);
            }}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-elev-3"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start gap-4 p-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
                  <AlertTriangle size={20} className="text-destructive" />
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-semibold">
                    {confirm.confirmTitle ?? "确认删除"}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {confirm.confirmDescription ?? "此操作不可撤销。"}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-border bg-muted/30 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setConfirm(null)}
                  disabled={loading}
                  className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={runConfirmed}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  {confirm.confirmLabel ?? "删除"}
                </button>
              </div>
            </div>
          </div>
        </ClientPortal>
      )}
    </>
  );
}
