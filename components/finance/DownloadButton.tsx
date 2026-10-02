"use client";

/*
 * Adapted from Opensource UI's "Download with States" component.
 * Source: https://opensourceui.in/components/download-button
 * License: MIT. Copyright notice retained here as required by the source instructions.
 *
 * Adapted to the project's Geist/dark token system and existing button primitives.
 */

import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import { ArrowDownToLine, Check, Loader2 } from "lucide-react";

type Phase = "idle" | "loading" | "done";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label?: string;
  loadingLabel?: string;
  doneLabel?: string;
  resetMs?: number;
};

export function DownloadButton({
  label = "Download PDF",
  loadingLabel = "Preparing",
  doneLabel = "Ready",
  resetMs = 1800,
  onClick,
  disabled,
  ...props
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (phase !== "idle" || disabled) return;
    onClick?.(e);
    setPhase("loading");
    timer.current = setTimeout(() => {
      setPhase("done");
      timer.current = setTimeout(() => setPhase("idle"), resetMs);
    }, 500);
  }

  const busy = phase === "loading";
  const done = phase === "done";

  return (
    <button
      {...props}
      type={props.type ?? "button"}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={handleClick}
      className={"state-action-button ui-pressable " + (busy ? "is-loading " : "") + (done ? "is-done " : "") + (props.className ?? "")}
    >
      <span className="state-action-icon" aria-hidden>
        {busy ? <Loader2 size={14} className="spin" /> : done ? <Check size={14} /> : <ArrowDownToLine size={14} />}
      </span>
      <span>{busy ? loadingLabel : done ? doneLabel : label}</span>
    </button>
  );
}
