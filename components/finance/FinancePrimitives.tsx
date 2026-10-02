"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
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
  return (
    <div className="finance-segmented-tabs" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          tabIndex={value === item.value ? 0 : -1}
          className={value === item.value ? "active" : ""}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panelRef.current?.querySelector<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
    );
    first?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
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
