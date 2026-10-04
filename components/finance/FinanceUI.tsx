"use client";

import { useCallback, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X } from "lucide-react";

type PressableButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function PressableButton({ children, className = "", type = "button", ...props }: PressableButtonProps) {
  return (
    <button {...props} type={type} className={"ui-pressable " + className}>
      {children}
    </button>
  );
}

/**
 * Source-level adaptation of ObsidianUI's interaction-first approach:
 * pointer position becomes a local spotlight rather than a global visual effect.
 * No runtime dependency is required, and the effect is disabled for reduced motion.
 */
export function SpotlightSurface({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty("--spotlight-x", `${event.clientX - rect.left}px`);
    node.style.setProperty("--spotlight-y", `${event.clientY - rect.top}px`);
  }, []);

  return (
    <div ref={ref} className={"ui-spotlight-surface " + className} onPointerMove={onPointerMove}>
      {children}
    </div>
  );
}

/**
 * Lightweight CSS loader in the spirit of Uiverse's copy-paste micro-interactions.
 * Keeps loading states structural and accessible instead of relying on a JS spinner.
 */
export function InlineLoader({ label = "Loading" }: { label?: string }) {
  return (
    <span className="ui-inline-loader" role="status" aria-label={label}>
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <span aria-hidden="true" />
    </span>
  );
}


type ManagedDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  overlayClassName?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
};

/**
 * Shared modal contract for finance composers and history surfaces.
 * Mirrors the behavioral guarantees expected from mature headless primitives:
 * labelled dialog, focus containment, Escape/backdrop dismissal, and focus restoration.
 */
export function ManagedDialog({
  open,
  onClose,
  title,
  description,
  children,
  className = "",
  overlayClassName = "",
  closeOnBackdrop = true,
  closeOnEscape = true,
}: ManagedDialogProps) {
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const selector =
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

    const focusFirst = () => {
      const first = panel?.querySelector<HTMLElement>(selector);
      (first ?? panel)?.focus();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (closeOnEscape && event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(selector))
        .filter(element => !element.hasAttribute("aria-hidden"));
      if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(focusFirst);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused && document.contains(previouslyFocused)) {
        requestAnimationFrame(() => previouslyFocused.focus());
      }
    };
  }, [open, closeOnEscape, onClose]);

  if (!open) return null;

  return (
    <div
      className={"overlay " + overlayClassName}
      onMouseDown={() => closeOnBackdrop && onClose()}
      data-managed-dialog="true"
    >
      <section
        ref={panelRef}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="drawer-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={`Close ${title}`}>
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function useReducedMotionPreference() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return reduced;
}
