"use client";

import { useEffect, useRef, type ReactNode } from "react";

// The one overlay in the app: a sheet that slides up from the bottom. It is backed by
// a history entry, so the phone's back gesture closes it instead of leaving the screen.
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    history.pushState({ sheet: true }, "");
    let closedByBack = false;
    const onPop = () => {
      closedByBack = true;
      onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      // Closed by a button: drop the history entry we added.
      if (!closedByBack && history.state?.sheet) history.back();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-end">
      <button type="button" aria-label="سكّر" onClick={onClose} className="absolute inset-0 bg-black/40 active:opacity-100!" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="sheet-up relative flex max-h-[85dvh] flex-col rounded-t-sheet bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-separator px-4 py-2">
          <h2 className="text-title">{title}</h2>
          <button type="button" onClick={onClose} className="min-h-11 px-2 font-medium text-accent">
            سكّر
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
