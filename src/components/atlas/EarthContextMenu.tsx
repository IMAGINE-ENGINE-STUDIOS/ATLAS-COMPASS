import { useEffect, useRef, useState } from "react";
import { Copy, ClipboardPaste, Share2, MapPin, Layers, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard, getClipboard, type FileClipboardEntry } from "@/lib/fileClipboard";
import { supabase } from "@/integrations/supabase/client";

export interface EarthLoc { lat: number; lng: number; alt: number }

interface Props {
  x: number;
  y: number;
  loc: EarthLoc;
  onClose: () => void;
  onCreatePOI: (loc: EarthLoc) => void;
  onPasteEntry: (entry: FileClipboardEntry, loc: EarthLoc) => void;
  onPickLevel?: (level: { id: string; name: string }, loc: EarthLoc) => void;
}

type LevelRow = { id: string; name: string; description: string | null };

export default function EarthContextMenu({ x, y, loc, onClose, onCreatePOI, onPasteEntry, onPickLevel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"root" | "levels">("root");
  const [levels, setLevels] = useState<LevelRow[] | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (view !== "levels" || levels !== null) return;
    (async () => {
      const { data, error } = await supabase
        .from("levels")
        .select("id,name,description")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) {
        toast.error("Could not load levels");
        setLevels([]);
      } else setLevels((data ?? []) as LevelRow[]);
    })();
  }, [view, levels]);

  const handleCopyLoc = async () => {
    copyToClipboard({
      kind: "generic",
      name: `Pin ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`,
      payload: { type: "atlas-location", ...loc },
    });
    try {
      await navigator.clipboard.writeText(`${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`);
    } catch {}
    toast.success("Location copied");
    onClose();
  };

  const handlePaste = () => {
    const cb = getClipboard();
    if (!cb) { toast.info("Clipboard is empty"); return; }
    onPasteEntry(cb, loc);
    onClose();
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/atlas?lat=${loc.lat.toFixed(6)}&lng=${loc.lng.toFixed(6)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Atlas location", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Share link copied");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Share link copied");
      } catch { toast.error("Couldn't share"); }
    }
    onClose();
  };

  const placeLevel = (lvl: LevelRow) => {
    if (!onPickLevel) {
      toast.error("Level placement unavailable");
      return;
    }
    onPickLevel({ id: lvl.id, name: lvl.name }, loc);
    onClose();
  };

  // clamp to viewport
  const W = 260;
  const H = view === "levels" ? 380 : 240;
  const left = Math.min(x, window.innerWidth - W - 8);
  const top = Math.min(y, window.innerHeight - H - 8);

  const filtered = (levels ?? []).filter((l) =>
    !filter.trim() ? true : l.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div
      ref={ref}
      style={{ position: "fixed", left, top, width: W, zIndex: 9999 }}
      className="rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-2xl text-white overflow-hidden"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 py-2 border-b border-white/10 text-[10px] font-mono text-white/70 flex items-center justify-between">
        <span>{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}</span>
        <span className="text-white/40">{Math.round(loc.alt)}m</span>
      </div>

      {view === "root" && (
        <div className="py-1">
          <MenuItem icon={<Copy className="w-3.5 h-3.5" />} label="Copy location" onClick={handleCopyLoc} />
          <MenuItem icon={<ClipboardPaste className="w-3.5 h-3.5" />} label="Paste in place" onClick={handlePaste} />
          <MenuItem icon={<Share2 className="w-3.5 h-3.5" />} label="Share" onClick={handleShare} />
          <div className="h-px bg-white/10 my-1" />
          <MenuItem icon={<Layers className="w-3.5 h-3.5" />} label="Load level here…" onClick={() => setView("levels")} />
          <MenuItem icon={<MapPin className="w-3.5 h-3.5" />} label="Drop POI here" onClick={() => { onCreatePOI(loc); onClose(); }} />
        </div>
      )}

      {view === "levels" && (
        <div className="flex flex-col" style={{ maxHeight: H - 40 }}>
          <div className="px-2 py-2 border-b border-white/10 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-white/50" />
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search levels…"
              className="bg-transparent text-xs outline-none flex-1 placeholder:text-white/40"
            />
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {levels === null && (
              <div className="px-3 py-6 text-center text-xs text-white/60 flex items-center justify-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
              </div>
            )}
            {levels !== null && filtered.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-white/60">No levels found</div>
            )}
            {filtered.map((lvl) => (
              <button
                key={lvl.id}
                onClick={() => placeLevel(lvl)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-white/10 flex items-center gap-2 disabled:opacity-50"
              >
                <Layers className="w-3 h-3 text-white/60" />
                <span className="truncate">{lvl.name}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setView("root")}
            className="px-3 py-2 text-[10px] text-white/60 hover:text-white border-t border-white/10 text-left"
          >
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 flex items-center gap-2"
    >
      <span className="text-white/70">{icon}</span>
      <span>{label}</span>
    </button>
  );
}