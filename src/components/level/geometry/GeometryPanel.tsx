import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Boxes, Upload, Sparkles, ChevronDown, FileText, Library } from "lucide-react";
import {
  parseGeometryCsv,
  csvToSceneObjects,
  sceneObjectsToCsv,
  GEOMETRY_CSV_FORMAT_DOC,
  type PrimitiveRow,
} from "@/lib/geometryCsv";
import type { SceneObject, Vec3 } from "@/lib/levelTypes";
import { GeometryGalleryDialog } from "./GeometryGalleryDialog";
import { CsvGeneratorDialog } from "./CsvGeneratorDialog";
import { toast } from "sonner";

export function GeometryPanel({
  anchor,
  selectedObject,
  onSpawn,
  disabled,
}: {
  anchor: Vec3;
  selectedObject: SceneObject;
  onSpawn: (objs: SceneObject[]) => void;
  disabled?: boolean;
}) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const spawnFromCsv = (csv: string) => {
    const parsed = parseGeometryCsv(csv);
    if (parsed.errors.length) {
      toast.warning(`${parsed.errors.length} CSV warning(s) — first: ${parsed.errors[0]}`);
    }
    const objs = csvToSceneObjects(parsed, anchor);
    if (objs.length === 0) { toast.error("No shapes found in CSV."); return; }
    onSpawn(objs);
    toast.success(`Spawned ${objs.length} shape${objs.length === 1 ? "" : "s"}`);
  };

  const spawnFromRows = (rows: PrimitiveRow[]) => {
    const objs = csvToSceneObjects({ primitives: rows, triangles: [], errors: [] }, anchor);
    onSpawn(objs);
    toast.success(`Spawned ${objs.length} shape${objs.length === 1 ? "" : "s"}`);
  };

  const handleUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => spawnFromCsv(String(reader.result ?? ""));
    reader.onerror = () => toast.error("Failed to read file");
    reader.readAsText(file);
  };

  return (
    <div className="space-y-1.5 pt-2 border-t border-border/40">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Boxes className="w-3 h-3" /> Geometries
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={disabled}
          onClick={() => setGalleryOpen(true)}>
          <Library className="w-3 h-3 mr-1" /> Gallery
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={disabled}
          onClick={() => fileRef.current?.click()}>
          <Upload className="w-3 h-3 mr-1" /> Upload CSV
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-[10px] col-span-2" disabled={disabled}
          onClick={() => setGenOpen(true)}>
          <Sparkles className="w-3 h-3 mr-1" /> Open CSV Generator
        </Button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = "";
        }}
      />

      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
          <ChevronDown className="w-3 h-3" /> <FileText className="w-3 h-3" /> CSV format
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mt-1.5 rounded-md border border-border/40 bg-muted/30 p-1.5 text-[9px] leading-tight whitespace-pre-wrap font-mono max-h-32 overflow-auto">
            {GEOMETRY_CSV_FORMAT_DOC}
          </pre>
        </CollapsibleContent>
      </Collapsible>

      <GeometryGalleryDialog
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        onLoad={spawnFromCsv}
        initialCsv={selectedObject.kind === "primitive" ? sceneObjectsToCsv([selectedObject]) : undefined}
      />
      <CsvGeneratorDialog
        open={genOpen}
        onOpenChange={setGenOpen}
        onSpawn={spawnFromRows}
      />
    </div>
  );
}