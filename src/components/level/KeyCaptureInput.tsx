import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Focusable chip that captures a single key combo on the next keydown after
 * focus. Stores the result in canonical `"Shift+E" | "7" | "F"` form so the
 * Play runtime can compare against `KeyboardEvent.key` directly.
 *
 * Used by the level inspector for binding per-object Play-mode keys.
 */
export function KeyCaptureInput({
  value,
  onChange,
  placeholder = "Press a key…",
  disabled,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) return;
    const handler = (e: KeyboardEvent) => {
      // ignore lone modifiers
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const parts: string[] = [];
      if (e.shiftKey) parts.push("Shift");
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.metaKey) parts.push("Meta");
      let k = e.key;
      if (k === " ") k = "Space";
      if (k.length === 1) k = k.toUpperCase();
      parts.push(k);
      onChange(parts.join("+"));
      setListening(false);
      btnRef.current?.blur();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [listening, onChange]);

  return (
    <button
      ref={btnRef}
      type="button"
      disabled={disabled}
      onClick={() => setListening((v) => !v)}
      onBlur={() => setListening(false)}
      className={cn(
        "h-7 min-w-[3.5rem] px-2 inline-flex items-center justify-center rounded-md border text-[11px] font-mono uppercase tracking-wider transition-colors",
        listening
          ? "border-primary bg-primary/10 text-primary animate-pulse"
          : "border-border/60 bg-background/50 text-foreground hover:border-primary/50",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
      title={listening ? "Listening — press any key" : "Click then press a key to bind"}
    >
      {listening ? "…" : value || placeholder}
    </button>
  );
}

export default KeyCaptureInput;