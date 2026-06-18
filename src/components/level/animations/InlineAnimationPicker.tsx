import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import type { CharacterClipEntry } from "@/lib/characterAnimationLibrary";
import { CHARACTER_ANIMATION_LIBRARY } from "@/lib/characterAnimationLibrary";

/**
 * Compact, inline searchable list used inside the Character inspector for
 * fast clip swaps without leaving the panel. Slot entries are hidden here
 * (only playable ones show) so the user gets a clean shortlist.
 */
export default function InlineAnimationPicker({
  currentClipName,
  extraEntries,
  onPick,
  max = 8,
}: {
  currentClipName?: string;
  extraEntries?: CharacterClipEntry[];
  onPick: (entry: CharacterClipEntry) => void;
  max?: number;
}) {
  const [query, setQuery] = useState("");

  const all = useMemo(
    () =>
      [...(extraEntries ?? []), ...CHARACTER_ANIMATION_LIBRARY].filter(
        (e) => e.source !== "slot",
      ),
    [extraEntries],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all.slice(0, max);
    return all
      .filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q)),
      )
      .slice(0, max);
  }, [all, query, max]);

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Quick find clip…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-7 pl-6 text-[11px]"
        />
      </div>
      <div className="max-h-40 overflow-auto rounded border border-border/30">
        {filtered.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic p-2">No matches</p>
        ) : (
          filtered.map((e) => {
            const active = currentClipName && e.clipName === currentClipName;
            return (
              <button
                key={e.id}
                onClick={() => onPick(e)}
                className={`w-full text-left px-2 py-1 text-[11px] transition-colors flex items-center gap-2 ${
                  active
                    ? "bg-primary/15 text-primary"
                    : "hover:bg-card text-foreground/80"
                }`}
              >
                <span className="flex-1 truncate">{e.name}</span>
                <span className="text-[8px] text-muted-foreground uppercase">{e.category}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}