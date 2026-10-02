"use client";

import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

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
