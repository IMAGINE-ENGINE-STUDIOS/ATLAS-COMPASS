// Lightweight runtime helpers shared by the editor preview and (eventually)
// the Play-mode runner. For now we only need a tiny "run preset action" that
// surfaces feedback via toasts so authors can verify behaviour.

import type { PresetAction, SceneObject } from "@/lib/levelTypes";
import { toast } from "sonner";

export function runPresetAction(
  preset: PresetAction,
  obj: SceneObject,
  mode: "preview" | "play",
) {
  switch (preset.type) {
    case "rotateContinuously":
      toast.message(`${obj.name} rotates @ ${preset.speed ?? 1} rad/s`);
      return;
    case "toggleVisibility":
      toast.message(`${obj.name} toggled visibility`);
      return;
    case "teleportPlayer":
      toast.message(`Teleport player to ${(preset.target ?? [0, 0, 0]).join(", ")}`);
      return;
    case "playSound":
      if (mode === "preview" && preset.url) {
        try {
          const a = new Audio(preset.url);
          a.volume = 0.6;
          void a.play();
        } catch { /* ignore */ }
      }
      toast.message(`Play sound · ${preset.url ?? "no url"}`);
      return;
    case "openUrl":
      if (mode === "preview" && preset.url) window.open(preset.url, "_blank", "noopener");
      else toast.message(`Open URL · ${preset.url ?? "no url"}`);
      return;
    case "spawnGeometry":
      toast.message(`Spawn geometry from CSV (${(preset.csv ?? "").split(/\r?\n/).length} lines)`);
      return;
  }
}