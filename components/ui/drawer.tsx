"use client";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/** Right-side panel. Escape closes; focus is trapped while open and restored after. */
export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const restore = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panel.current) return;
      const f = panel.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])',
      );
      if (!f.length) return;
      const first = f[0],
        last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = "";
      restore?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="panel-root">
      <div className="panel-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={panel} className="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title" tabIndex={-1}>
        <div className="panel-head">
          <h2 id="panel-title" className="box-title" style={{ fontSize: 16 }}>
            {title}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="panel-body">{children}</div>
      </div>
    </div>
  );
}
