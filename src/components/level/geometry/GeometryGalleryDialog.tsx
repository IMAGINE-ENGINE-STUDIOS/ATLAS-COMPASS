import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Globe, Lock, Trash2, Plus, Loader2, Boxes } from "lucide-react";

interface GeometryRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  csv_content: string;
  shape_count: number;
  created_at: string;
}

export function GeometryGalleryDialog({
  open,
  onOpenChange,
  onLoad,
  initialCsv,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoad: (csv: string) => void;
  /** Pre-fills the "Save current" form with the selected object as CSV. */
  initialCsv?: string;
}) {
  const [tab, setTab] = useState<"public" | "mine" | "save">("public");
  const [items, setItems] = useState<GeometryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Save form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [csv, setCsv] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (open && initialCsv) setCsv(initialCsv);
  }, [open, initialCsv]);

  const fetchItems = async () => {
    setLoading(true);
    let q = supabase.from("geometries").select("*").order("created_at", { ascending: false }).limit(100);
    if (tab === "public") q = q.eq("is_public", true);
    else if (tab === "mine" && userId) q = q.eq("owner_id", userId);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    else setItems((data ?? []) as GeometryRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    if (tab === "save") return;
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, userId]);

  const handleSave = async () => {
    if (!userId) { toast.error("Sign in to save geometries."); return; }
    if (!name.trim()) { toast.error("Give your geometry a name."); return; }
    if (!csv.trim()) { toast.error("CSV content is empty."); return; }
    setSaving(true);
    const shapeCount = csv.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#")).length;
    const { error } = await supabase.from("geometries").insert({
      owner_id: userId,
      name: name.trim(),
      description: description.trim() || null,
      is_public: isPublic,
      csv_content: csv,
      shape_count: shapeCount,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Saved "${name}"`);
    setName(""); setDescription("");
    setTab("mine");
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("geometries").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); setItems((it) => it.filter((x) => x.id !== id)); }
  };

  const handleLoad = (row: GeometryRow) => {
    onLoad(row.csv_content);
    onOpenChange(false);
    toast.success(`Loaded "${row.name}"`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Boxes className="w-4 h-4" /> Geometry Gallery</DialogTitle>
          <DialogDescription>
            Browse public geometries, your saved geometries, or save the current object as a new geometry.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="public" className="text-xs"><Globe className="w-3 h-3 mr-1" /> Public</TabsTrigger>
            <TabsTrigger value="mine" className="text-xs"><Lock className="w-3 h-3 mr-1" /> Mine</TabsTrigger>
            <TabsTrigger value="save" className="text-xs"><Plus className="w-3 h-3 mr-1" /> Save current</TabsTrigger>
          </TabsList>

          <TabsContent value="public" className="mt-3">
            <GalleryList loading={loading} items={items} onLoad={handleLoad} canDelete={false} onDelete={handleDelete} />
          </TabsContent>
          <TabsContent value="mine" className="mt-3">
            <GalleryList loading={loading} items={items} onLoad={handleLoad} canDelete onDelete={handleDelete} />
          </TabsContent>

          <TabsContent value="save" className="mt-3 space-y-2">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" placeholder="e.g. Cozy stair" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-8 text-xs" placeholder="optional" />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/40 bg-muted/20 px-2 py-1.5">
              <Label className="text-[11px]">Make public</Label>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </div>
            <div>
              <Label className="text-xs">CSV content</Label>
              <Textarea
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                className="h-40 text-[10px] font-mono"
                placeholder="# PRIMITIVES&#10;box,Wall,0,0.5,0,2,1,0.2,0,0,0,#88aaff"
              />
            </div>
            <Button size="sm" className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
              Save geometry
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function GalleryList({
  loading, items, onLoad, canDelete, onDelete,
}: {
  loading: boolean;
  items: GeometryRow[];
  onLoad: (row: GeometryRow) => void;
  canDelete: boolean;
  onDelete: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="py-8 flex items-center justify-center text-muted-foreground text-xs">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…
      </div>
    );
  }
  if (items.length === 0) {
    return <div className="py-8 text-center text-xs text-muted-foreground">No geometries yet.</div>;
  }
  return (
    <ScrollArea className="max-h-[50vh] pr-2">
      <div className="space-y-1.5">
        {items.map((g) => (
          <div key={g.id} className="rounded-lg border border-border/40 bg-muted/20 p-2 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium truncate">{g.name}</span>
                {g.is_public && <Badge variant="secondary" className="h-4 text-[9px]"><Globe className="w-2.5 h-2.5 mr-0.5" />Public</Badge>}
                <Badge variant="outline" className="h-4 text-[9px]">{g.shape_count} shapes</Badge>
              </div>
              {g.description && <p className="text-[10px] text-muted-foreground truncate">{g.description}</p>}
            </div>
            <Button size="sm" variant="secondary" className="h-7 text-[10px]" onClick={() => onLoad(g)}>Load</Button>
            {canDelete && (
              <button onClick={() => onDelete(g.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}