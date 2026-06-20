/**
 * AtlasSettingsDropdown
 * ----------------------
 * The "ATLAS" home button is now a dropdown trigger. The dropdown holds:
 *   1. Camera Controls (history timeline + bookmarks, embedded)
 *   2. Navigation Controls (WASD/arrows toggle + sensitivity + focus-point hint)
 *   3. Settings (HUD-level toggles forwarded by props)
 *
 * Persistence is local — `localStorage` keys are namespaced under `atlas.*`.
 */

import { useEffect, useRef, useState } from "react";
import { Camera, ChevronDown, Compass, Gamepad2, Settings as SettingsIcon, X } from "lucide-react";
import { type Viewer } from "cesium";
import CameraHistoryTimeline from "./CameraHistoryTimeline";
import GlyphIcon from "./GlyphIcon";

interface Props {
  viewerRef: React.MutableRefObject<Viewer | null>;
  isLoaded: boolean;
  kbNavEnabled: boolean;
  onKbNavChange: (v: boolean) => void;
  kbSensitivity: number;
  onKbSensitivityChange: (v: number) => void;
  hudVisible: boolean;
  onHudVisibleChange: (v: boolean) => void;
  showBuildings: boolean;
  onShowBuildingsChange: (v: boolean) => void;
}

type Section = "camera" | "nav" | "settings";

export default function AtlasSettingsDropdown({
  viewerRef,
  isLoaded,
  kbNavEnabled,
  onKbNavChange,
  kbSensitivity,
  onKbSensitivityChange,
  hudVisible,
  onHudVisibleChange,
  showBuildings,
  onShowBuildingsChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<Section>("camera");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDocClick);
    return () => window.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="bg-black/60 backdrop-blur-md border border-white/15 rounded-xl px-3 py-2 flex items-center gap-1.5 hover:bg-black/75 transition-colors text-white"
        title="Atlas menu"
      >
        <GlyphIcon name="atlas" alt="Atlas" glow="#22d3ee" />
        <span className="text-sm font-bold">ATLAS</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-white/60 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-slate-900/95 backdrop-blur-xl shadow-2xl text-white overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center justify-between border-b border-white/10 px-2 py-1.5">
            <div className="flex items-center gap-0.5">
              <TabBtn active={section === "camera"} onClick={() => setSection("camera")} icon={<Camera className="w-3.5 h-3.5" />} label="Camera" />
              <TabBtn active={section === "nav"} onClick={() => setSection("nav")} icon={<Gamepad2 className="w-3.5 h-3.5" />} label="Navigation" />
              <TabBtn active={section === "settings"} onClick={() => setSection("settings")} icon={<SettingsIcon className="w-3.5 h-3.5" />} label="Settings" />
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-md hover:bg-white/10 text-white/60"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-3 max-h-[60vh] overflow-y-auto">
            {section === "camera" && (
              <CameraHistoryTimeline viewerRef={viewerRef} isLoaded={isLoaded} embedded />
            )}

            {section === "nav" && (
              <div className="space-y-3">
                <Toggle
                  label="WASD / Arrow keys"
                  hint="Hold Shift to boost · Q/E for down/up"
                  value={kbNavEnabled}
                  onChange={onKbNavChange}
                />
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-white/60">
                    Move sensitivity · {kbSensitivity.toFixed(1)}x
                  </label>
                  <input
                    type="range"
                    min={0.2}
                    max={3}
                    step={0.1}
                    value={kbSensitivity}
                    onChange={(e) => onKbSensitivityChange(Number(e.target.value))}
                    className="w-full accent-cyan-400 mt-1"
                  />
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-[11px] text-white/70 leading-relaxed">
                  <div className="flex items-center gap-1.5 mb-1 text-white/90 font-semibold">
                    <Compass className="w-3.5 h-3.5 text-cyan-300" /> Mouse
                  </div>
                  <ul className="space-y-0.5 list-disc list-inside">
                    <li><b>Double-click</b> the globe → rotate around that point</li>
                    <li><b>Right-click</b> → context menu (place model, POI…)</li>
                    <li>Press <kbd className="px-1 py-0.5 rounded bg-white/10">Esc</kbd> to release focus</li>
                  </ul>
                </div>
              </div>
            )}

            {section === "settings" && (
              <div className="space-y-3">
                <Toggle label="Show HUD" value={hudVisible} onChange={onHudVisibleChange} />
                <Toggle label="Show buildings" value={showBuildings} onChange={onShowBuildingsChange} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
        active ? "bg-cyan-500/20 text-cyan-200" : "text-white/70 hover:text-white hover:bg-white/5"
      }`}
    >
      {icon} {label}
    </button>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-3 cursor-pointer">
      <div className="min-w-0">
        <div className="text-sm text-white">{label}</div>
        {hint && <div className="text-[10px] text-white/50 mt-0.5">{hint}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`shrink-0 w-9 h-5 rounded-full transition-colors relative ${value ? "bg-cyan-500" : "bg-white/15"}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`}
        />
      </button>
    </label>
  );
}