/**
 * Pre-import configuration for CAD / 3D model uploads.
 *
 * Sits between the file picker and the conversion pipeline so users
 * can tell us:
 *   - Output format hint for the server worker (glTF vs DXF)
 *   - Source units — CAD files often ship in mm/in/ft; we convert
 *     them to Imagine Engine's meter scale
 *   - Extra uniform scale multiplier
 *   - Up-axis of the source (Z-up in most CAD, Y-up in Imagine Engine)
 *   - Recentre + drop-to-floor toggle
 */
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Sparkles } from "lucide-react";

export type CadOutputFormat = "auto" | "glb" | "dxf";
export type CadUnit = "m" | "cm" | "mm" | "in" | "ft";
export type CadUpAxis = "y" | "z";

export interface CadImportSettings {
  outputFormat: CadOutputFormat;
  units: CadUnit;
  scale: number;
  upAxis: CadUpAxis;
  recenter: boolean;
  dropToFloor: boolean;
  mergeMeshes: boolean;
}

export const DEFAULT_CAD_SETTINGS: CadImportSettings = {
  outputFormat: "auto",
  units: "m",
  scale: 1,
  upAxis: "y",
  recenter: true,
  dropToFloor: true,
  mergeMeshes: false,
};

export const UNIT_TO_METERS: Record<CadUnit, number> = {
  m: 1,
  cm: 0.01,
  mm: 0.001,
  in: 0.0254,
  ft: 0.3048,
};

const SETTINGS_KEY = "imagine.cadImportSettings.v1";

function loadStoredSettings(): CadImportSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_CAD_SETTINGS;
    return { ...DEFAULT_CAD_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CAD_SETTINGS;
  }
}

interface Props {
  open: boolean;
  fileName: string | null;
  isCad: boolean;
  onCancel: () => void;
  onConfirm: (settings: CadImportSettings) => void;
}

export function CadImportSettingsDialog({ open, fileName, isCad, onCancel, onConfirm }: Props) {
  const [settings, setSettings] = useState<CadImportSettings>(() => loadStoredSettings());

  useEffect(() => {
    if (open) setSettings(loadStoredSettings());
  }, [open]);

  const patch = (p: Partial<CadImportSettings>) =>
    setSettings((s) => ({ ...s, ...p }));

  const confirm = () => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* storage may be blocked */
    }
    onConfirm(settings);
  };

  const effectiveScale = UNIT_TO_METERS[settings.units] * settings.scale;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-md bg-background/95 backdrop-blur-xl border-fuchsia-500/30">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-fuchsia-400" />
            Import settings
          </DialogTitle>
          <DialogDescription className="text-[11px] truncate">
            {fileName ? `Preparing ${fileName}` : "Configure how this model is converted."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {isCad && (
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Output format
              </Label>
              <Select
                value={settings.outputFormat}
                onValueChange={(v) => patch({ outputFormat: v as CadOutputFormat })}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (best available)</SelectItem>
                  <SelectItem value="glb">glTF / GLB — full 3D mesh</SelectItem>
                  <SelectItem value="dxf">DXF — 2D outline / vectors</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Hint for the DWG worker. Falls back to glTF if DXF isn't produced.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Source units
              </Label>
              <Select
                value={settings.units}
                onValueChange={(v) => patch({ units: v as CadUnit })}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="m">Meters</SelectItem>
                  <SelectItem value="cm">Centimeters</SelectItem>
                  <SelectItem value="mm">Millimeters</SelectItem>
                  <SelectItem value="in">Inches</SelectItem>
                  <SelectItem value="ft">Feet</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Up axis
              </Label>
              <Select
                value={settings.upAxis}
                onValueChange={(v) => patch({ upAxis: v as CadUpAxis })}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="y">Y-up (Imagine, glTF)</SelectItem>
                  <SelectItem value="z">Z-up (most CAD)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Uniform scale multiplier
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.1"
                min="0.0001"
                value={settings.scale}
                onChange={(e) =>
                  patch({ scale: Math.max(0.0001, Number(e.target.value) || 1) })
                }
                className="h-9 text-xs font-mono"
              />
              <div className="text-[10px] text-muted-foreground whitespace-nowrap font-mono">
                = {effectiveScale.toExponential(2)}× to meters
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-border/40 p-3 bg-muted/20">
            <label className="flex items-center justify-between text-xs">
              <span>Recentre on origin</span>
              <Switch
                checked={settings.recenter}
                onCheckedChange={(v) => patch({ recenter: v })}
              />
            </label>
            <label className="flex items-center justify-between text-xs">
              <span>Drop base to floor (y = 0)</span>
              <Switch
                checked={settings.dropToFloor}
                onCheckedChange={(v) => patch({ dropToFloor: v })}
              />
            </label>
            {isCad && (
              <label className="flex items-center justify-between text-xs">
                <span>Merge meshes (fewer draw calls)</span>
                <Switch
                  checked={settings.mergeMeshes}
                  onCheckedChange={(v) => patch({ mergeMeshes: v })}
                />
              </label>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettings(DEFAULT_CAD_SETTINGS)}
          >
            Reset
          </Button>
          <Button
            size="sm"
            onClick={confirm}
            className="bg-fuchsia-500/20 hover:bg-fuchsia-500/30 border border-fuchsia-500/40 text-fuchsia-100"
          >
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}