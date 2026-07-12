import { useCallback, useState } from "react";
import { detectKindFromFile } from "@/lib/geoRealm/dataSources";
import type { GeoRealmKind } from "@/lib/geoRealm/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface QueueItem {
  file: File;
  kind: GeoRealmKind;
  hint: string;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  message?: string;
}

const KINDS: GeoRealmKind[] = [
  "plates",
  "faults",
  "slab",
  "crust",
  "seismic",
  "tomography",
  "bathymetry",
  "cad",
  "custom",
];

export default function GeoRealmCompiler({ onBundleAdded }: { onBundleAdded?: () => void }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [bundleName, setBundleName] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [isPublic, setIsPublic] = useState(false);

  const addFiles = useCallback((files: File[]) => {
    setQueue((q) => [
      ...q,
      ...files.map((f) => {
        const d = detectKindFromFile(f);
        return { file: f, kind: d.kind, hint: d.hint, status: "pending" as const, progress: 0 };
      }),
    ]);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles],
  );

  async function publish() {
    if (queue.length === 0) {
      toast.error("Drop at least one file first");
      return;
    }
    if (!bundleName.trim()) {
      toast.error("Give the bundle a name");
      return;
    }
    setPublishing(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        toast.error("Sign in to publish bundles");
        setPublishing(false);
        return;
      }

      const layers: {
        id: string;
        kind: GeoRealmKind;
        label: string;
        visible: boolean;
        url: string;
        meta: Record<string, unknown>;
      }[] = [];

      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        setQueue((q) => q.map((x, idx) => (idx === i ? { ...x, status: "uploading" } : x)));
        const path = `${uid}/${Date.now()}_${i}_${item.file.name}`;
        const { error: upErr } = await supabase.storage
          .from("geo-realm-bundles")
          .upload(path, item.file, { upsert: false, contentType: item.file.type || "application/octet-stream" });
        if (upErr) {
          setQueue((q) =>
            q.map((x, idx) => (idx === i ? { ...x, status: "error", message: upErr.message } : x)),
          );
          continue;
        }
        const { data: signed } = await supabase.storage
          .from("geo-realm-bundles")
          .createSignedUrl(path, 60 * 60 * 24 * 7);
        layers.push({
          id: crypto.randomUUID(),
          kind: item.kind,
          label: item.file.name,
          visible: true,
          url: signed?.signedUrl ?? path,
          meta: { originalName: item.file.name, sizeBytes: item.file.size, hint: item.hint },
        });
        setQueue((q) => q.map((x, idx) => (idx === i ? { ...x, status: "done", progress: 100 } : x)));
      }

      const primaryKind = queue[0]?.kind ?? "custom";
      const { error: insErr } = await supabase.from("geo_realm_bundles").insert({
        owner_id: uid,
        name: bundleName.trim(),
        kind: primaryKind,
        description: `Compiled from ${queue.length} file(s).`,
        source_meta: { compiledAt: new Date().toISOString(), fileCount: queue.length },
        layers: layers as unknown as never,
        is_public: isPublic,
      });
      if (insErr) {
        toast.error(`Publish failed: ${insErr.message}`);
      } else {
        toast.success(`Published "${bundleName}"`);
        setQueue([]);
        setBundleName("");
        onBundleAdded?.();
      }
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-white/50">
        01 · Compiler
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border border-dashed p-4 text-center text-xs transition ${
          dragging
            ? "border-orange-400/70 bg-orange-400/10 text-orange-200"
            : "border-white/15 bg-white/[0.03] text-white/60"
        }`}
      >
        Drop SEG-Y, NetCDF, GeoTIFF, GeoJSON, glTF, DXF…
        <label className="mt-2 block cursor-pointer text-[11px] text-white/80 underline decoration-dotted">
          or browse
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))}
          />
        </label>
      </div>

      {queue.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {queue.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[11px]"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  item.status === "done"
                    ? "bg-emerald-400"
                    : item.status === "error"
                      ? "bg-red-400"
                      : item.status === "uploading"
                        ? "bg-amber-400 animate-pulse"
                        : "bg-white/40"
                }`}
              />
              <span className="min-w-0 flex-1 truncate text-white/85">{item.file.name}</span>
              <select
                value={item.kind}
                onChange={(e) =>
                  setQueue((q) =>
                    q.map((x, idx) => (idx === i ? { ...x, kind: e.target.value as GeoRealmKind } : x)),
                  )
                }
                className="rounded bg-black/40 px-1 py-0.5 text-[10px] uppercase tracking-wide text-white/80"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setQueue((q) => q.filter((_, idx) => idx !== i))}
                className="text-white/40 hover:text-white/80"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
        <input
          value={bundleName}
          onChange={(e) => setBundleName(e.target.value)}
          placeholder="Bundle name"
          className="rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-white/90 placeholder:text-white/30 outline-none focus:border-orange-400/60"
        />
        <label className="flex items-center gap-2 text-[11px] text-white/60">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="accent-orange-400"
          />
          Publish as public bundle
        </label>
        <button
          type="button"
          onClick={publish}
          disabled={publishing || queue.length === 0}
          className="rounded-md bg-orange-500/90 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-black disabled:opacity-40"
        >
          {publishing ? "Publishing…" : "Compile bundle"}
        </button>
      </div>
    </div>
  );
}