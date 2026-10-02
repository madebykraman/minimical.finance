"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { X } from "lucide-react";

export type FinanceStatus = "draft" | "sent" | "partially_paid" | "paid" | "void";

const STATUS_LABELS: Record<FinanceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_paid: "Partially paid",
  paid: "Paid",
  void: "Void",
};

export function StatusPill({ status, label }: { status: FinanceStatus; label?: string }) {
  return (
    <span className={"finance-status-pill " + status} data-status={status}>
      <span className="finance-status-dot" aria-hidden />
      {label ?? STATUS_LABELS[status]}
    </span>
  );
}

export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  const tabGroupId = useId().replace(/:/g, "");
  const activeIndex = Math.max(0, items.findIndex((item) => item.value === value));
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!items.length) return;
    let next = activeIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (activeIndex + 1) % items.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (activeIndex - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    onChange(items[next].value);
    requestAnimationFrame(() => {
      document.getElementById(`${tabGroupId}-tab-${items[next].value}`)?.focus();
    });
  };

  return (
    <div className="finance-segmented-tabs" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const id = `${tabGroupId}-tab-${item.value}`;
        return (
          <button
            key={item.value}
            id={id}
            type="button"
            role="tab"
            aria-selected={value === item.value}
            tabIndex={value === item.value ? 0 : -1}
            className={value === item.value ? "active" : ""}
            onClick={() => onChange(item.value)}
            onKeyDown={onKeyDown}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function MobileSheet({
  open,
  onClose,
  title,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  labelledBy?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector =
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector))
        .filter(element => !element.hasAttribute("aria-hidden"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panel?.querySelector<HTMLElement>(focusableSelector);
    requestAnimationFrame(() => first?.focus());
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="finance-sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={panelRef}
        className="finance-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="finance-sheet-grab" aria-hidden />
        {title && (
          <header className="finance-sheet-head">
            <h2 id={labelledBy ?? titleId}>{title}</h2>
            <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
              <X size={17} />
            </button>
          </header>
        )}
        {children}
      </section>
    </div>
  );
}
