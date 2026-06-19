import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Download, ChevronDown, FileText, Sparkles } from "lucide-react";
import {
  PRIMITIVE_SHAPE_LIST,
  serializePrimitives,
  GEOMETRY_CSV_FORMAT_DOC,
  type PrimitiveRow,
  type PrimitiveShape,
} from "@/lib/geometryCsv";
import { toast } from "sonner";

const blankRow = (): PrimitiveRow => ({
  shape: "box",
  name: "Shape",
  position: [0, 0.5, 0],
  scale: [1, 1, 1],
  rotationDeg: [0, 0, 0],
  color: "#88aaff",
});

export function CsvGeneratorDialog({
  open,
  onOpenChange,
  onSpawn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSpawn?: (rows: PrimitiveRow[]) => void;
}) {
  const [rows, setRows] = useState<PrimitiveRow[]>([blankRow()]);
  const [name, setName] = useState("My Geometry");

  const update = (i: number, patch: Partial<PrimitiveRow>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  const handleDownload = () => {
    const csv = serializePrimitives(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^a-z0-9_-]+/gi, "-") || "geometry"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${a.download}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            CSV Geometry Generator
          </DialogTitle>
          <DialogDescription>
            Build a list of primitives with dimensions, download the CSV, or spawn it directly into the scene.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[160px_1fr] gap-2 items-center">
          <Label className="text-xs">File name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
        </div>

        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
            <ChevronDown className="w-3 h-3" /> <FileText className="w-3 h-3" /> Show CSV format
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-2 rounded-md border border-border/40 bg-muted/30 p-2 text-[10px] leading-snug whitespace-pre-wrap font-mono max-h-40 overflow-auto">
              {GEOMETRY_CSV_FORMAT_DOC}
            </pre>
          </CollapsibleContent>
        </Collapsible>

        <ScrollArea className="max-h-[45vh] pr-2">
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="rounded-lg border border-border/40 bg-muted/20 p-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Select value={row.shape} onValueChange={(v) => update(i, { shape: v as PrimitiveShape })}>
                    <SelectTrigger className="h-7 w-28 text-[11px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIMITIVE_SHAPE_LIST.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={row.name ?? ""}
                    onChange={(e) => update(i, { name: e.target.value })}
                    placeholder="name"
                    className="h-7 text-[11px] flex-1"
                  />
                  <Input
                    type="color"
                    value={row.color ?? "#88aaff"}
                    onChange={(e) => update(i, { color: e.target.value })}
                    className="h-7 w-10 p-0.5"
                  />
                  <button
                    onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["Position (x,y,z)", "Scale (w,h,d)", "Rotation° (x,y,z)"] as const).map((label, group) => (
                    <div key={label}>
                      <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</Label>
                      <div className="grid grid-cols-3 gap-1">
                        {[0, 1, 2].map((axis) => (
                          <Input
                            key={axis}
                            type="number"
                            step={0.1}
                            value={group === 0 ? row.position[axis] : group === 1 ? row.scale[axis] : row.rotationDeg[axis]}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0;
                              if (group === 0) {
                                const next = [...row.position] as [number, number, number];
                                next[axis] = v;
                                update(i, { position: next });
                              } else if (group === 1) {
                                const next = [...row.scale] as [number, number, number];
                                next[axis] = v;
                                update(i, { scale: next });
                              } else {
                                const next = [...row.rotationDeg] as [number, number, number];
                                next[axis] = v;
                                update(i, { rotationDeg: next });
                              }
                            }}
                            className="h-6 text-[10px] px-1"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
          <Button size="sm" variant="outline" onClick={() => setRows((r) => [...r, blankRow()])}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add shape
          </Button>
          <div className="flex items-center gap-2">
            {onSpawn && (
              <Button size="sm" variant="secondary" onClick={() => { onSpawn(rows); onOpenChange(false); }}>
                Spawn in scene
              </Button>
            )}
            <Button size="sm" onClick={handleDownload}>
              <Download className="w-3.5 h-3.5 mr-1" /> Download CSV
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}