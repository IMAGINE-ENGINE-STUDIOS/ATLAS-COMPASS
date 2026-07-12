/**
 * QuakeEventLibrary
 * -----------------
 * Common attached-files library for a single earthquake event. Any signed-in
 * user can:
 *   - Upload arbitrary files (PDF reports, photos, spreadsheets…)
 *   - Upload seismographic raw data (miniSEED, SAC, SEG-Y, ASCII, GeoJSON)
 *   - Attach an external link (e.g. a paper, an IRIS waveform URL)
 *   - Browse the institutional data-source catalog and "tune in" to a
 *     real-time streaming source (WebSocket / SeedLink / Atom).
 *
 * All uploads land in the private `quake-event-files` bucket under the
 * user's own folder; DB rows in `quake_event_files` are viewable by anyone
 * but only editable/deletable by the uploader.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, Loader2, Trash2, ExternalLink, Radio, Link as LinkIcon, Waves, FileText, Search, Building2, Globe2, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ensureLevelSession, getCurrentUserId } from "@/lib/levelSession";
import { toast } from "sonner";
import type { QuakeTag } from "./QuakeTagsOverlay";
import { QUAKE_INSTITUTIONS, QUAKE_STREAM_PRESETS, type QuakeInstitution } from "./quakeInstitutions";

interface QuakeFile {
  id: string;
  event_id: string;
  event_source: string;
  owner_id: string;
  name: string;
  description: string | null;
  kind: string;
  is_raw_seismogram: boolean;
  storage_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface Props {
  quake: QuakeTag;
  source: string;
  onTuneSource?: (institution: QuakeInstitution) => void;
}

// Extension heuristics for common seismographic raw formats. Users can
// still override with the checkbox before uploading.
const RAW_SEISMO_EXT = new Set(["mseed", "seed", "sac", "segy", "sgy", "ascii", "asc", "gcf", "css", "cwb", "quakeml", "xml"]);
function looksLikeRawSeismogram(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return RAW_SEISMO_EXT.has(ext);
}
function humanBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function QuakeEventLibrary({ quake, source, onTuneSource }: Props) {
  const [files, setFiles] = useState<QuakeFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [markRaw, setMarkRaw] = useState(false);
  const [note, setNote] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [institutionQuery, setInstitutionQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState<"all" | "usa" | "intl">("all");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { void getCurrentUserId().then(setUserId); }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("quake_event_files")
        .select("*")
        .eq("event_id", quake.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setFiles((data as QuakeFile[]) ?? []);
    } catch (e) {
      console.warn("[quake-library] list", e);
    } finally { setLoading(false); }
  }, [quake.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const doUpload = useCallback(async (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    setUploading(true);
    try {
      const uid = await ensureLevelSession();
      if (!uid) throw new Error("Sign in required to upload event files.");
      setUserId(uid);
      for (const file of Array.from(fileList)) {
        const isRaw = markRaw || looksLikeRawSeismogram(file.name);
        const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
        const path = `${uid}/${quake.id}/${crypto.randomUUID()}-${safe}`;
        const up = await supabase.storage.from("quake-event-files").upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
        if (up.error) throw up.error;
        const { error: dbErr } = await supabase.from("quake_event_files").insert({
          event_id: quake.id,
          event_source: source,
          event_place: quake.place,
          event_mag: quake.mag,
          owner_id: uid,
          name: file.name,
          description: note || null,
          kind: isRaw ? "raw_seismogram" : "file",
          is_raw_seismogram: isRaw,
          storage_path: path,
          mime_type: file.type || null,
          size_bytes: file.size,
        });
        if (dbErr) throw dbErr;
      }
      toast.success(`Uploaded ${fileList.length} file(s) to event library`);
      setNote("");
      setMarkRaw(false);
      await refresh();
    } catch (e) {
      const msg = (e as Error).message || "Upload failed";
      toast.error(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [markRaw, note, quake, source, refresh]);

  const attachLink = useCallback(async () => {
    if (!linkUrl.trim()) return;
    try {
      const uid = await ensureLevelSession();
      if (!uid) throw new Error("Sign in required to attach a link.");
      const { error } = await supabase.from("quake_event_files").insert({
        event_id: quake.id,
        event_source: source,
        event_place: quake.place,
        event_mag: quake.mag,
        owner_id: uid,
        name: linkLabel.trim() || linkUrl,
        description: note || null,
        kind: "link",
        external_url: linkUrl.trim(),
      });
      if (error) throw error;
      toast.success("Link attached to event library");
      setLinkUrl(""); setLinkLabel(""); setNote("");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "Could not attach link");
    }
  }, [linkUrl, linkLabel, note, quake, source, refresh]);

  const tuneStream = useCallback(async (preset: typeof QUAKE_STREAM_PRESETS[number]) => {
    try {
      const uid = await ensureLevelSession();
      if (!uid) throw new Error("Sign in required to save a stream tune-in.");
      const { error } = await supabase.from("quake_event_files").insert({
        event_id: quake.id,
        event_source: source,
        event_place: quake.place,
        event_mag: quake.mag,
        owner_id: uid,
        name: `Streaming source: ${preset.label}`,
        description: preset.description ?? null,
        kind: "stream",
        external_url: preset.url,
        metadata: { provider: preset.provider, stream_kind: preset.kind } as any,
      });
      if (error) throw error;
      toast.success(`Tuned in to ${preset.label}`);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "Could not tune stream");
    }
  }, [quake, source, refresh]);

  const removeFile = useCallback(async (f: QuakeFile) => {
    try {
      if (f.storage_path) {
        await supabase.storage.from("quake-event-files").remove([f.storage_path]);
      }
      const { error } = await supabase.from("quake_event_files").delete().eq("id", f.id);
      if (error) throw error;
      toast.success("Removed");
      setFiles((prev) => prev.filter((x) => x.id !== f.id));
    } catch (e) {
      toast.error((e as Error).message || "Could not delete");
    }
  }, []);

  const openFile = useCallback(async (f: QuakeFile) => {
    if (f.external_url) { window.open(f.external_url, "_blank", "noopener"); return; }
    if (!f.storage_path) return;
    const { data, error } = await supabase.storage
      .from("quake-event-files")
      .createSignedUrl(f.storage_path, 60 * 60);
    if (error || !data?.signedUrl) { toast.error("Couldn't open file"); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }, []);

  const filteredInstitutions = useMemo(() => {
    const q = institutionQuery.trim().toLowerCase();
    return QUAKE_INSTITUTIONS.filter((i) => {
      if (countryFilter === "usa" && i.country !== "USA") return false;
      if (countryFilter === "intl" && i.country === "USA") return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        i.agency.toLowerCase().includes(q) ||
        i.country.toLowerCase().includes(q)
      );
    });
  }, [institutionQuery, countryFilter]);

  return (
    <div className="space-y-4">
      {/* Upload block */}
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-white/60 flex items-center gap-1">
            <Upload className="w-3 h-3" /> Contribute to library
          </div>
          <label className="flex items-center gap-1 text-[10px] text-white/70 select-none">
            <input type="checkbox" checked={markRaw} onChange={(e) => setMarkRaw(e.target.checked)} className="accent-red-500" />
            <Waves className="w-3 h-3" /> Mark as raw seismogram
          </label>
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional description (station, instrument, sample rate…)"
          className="w-full bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-[11px]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={(e) => void doUpload(e.target.files)}
            className="text-[11px] file:mr-2 file:h-7 file:px-2 file:rounded file:border-0 file:bg-red-500/25 file:text-red-100 file:text-[10px] file:uppercase file:tracking-widest file:font-bold hover:file:bg-red-500/40"
          />
          {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/60" />}
        </div>
        <div className="pt-1 border-t border-white/[0.06] space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-white/40 flex items-center gap-1">
            <LinkIcon className="w-3 h-3" /> Or attach an external link
          </div>
          <div className="flex gap-1">
            <input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Label"
              className="w-1/3 bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-[11px]" />
            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…"
              className="flex-1 bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-[11px]" />
            <button onClick={() => void attachLink()} disabled={!linkUrl.trim()}
              className="h-7 px-2 rounded bg-white/[0.06] border border-white/10 text-[10px] uppercase tracking-widest hover:bg-white/10 disabled:opacity-40">
              Attach
            </button>
          </div>
        </div>
        {!userId && (
          <div className="text-[10px] text-amber-300/80">
            You'll be signed in automatically when you upload.
          </div>
        )}
      </div>

      {/* Existing library */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-white/60">
            Event library {files.length ? `· ${files.length}` : ""}
          </div>
          {loading && <Loader2 className="w-3 h-3 animate-spin text-white/50" />}
        </div>
        {!loading && !files.length && (
          <div className="text-[11px] text-white/50 text-center py-4 border border-dashed border-white/10 rounded-lg">
            No files attached yet. Be the first to contribute.
          </div>
        )}
        {files.length > 0 && (
          <div className="max-h-[24vh] overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/[0.06]">
            {files.map((f) => {
              const iconColor = f.kind === "raw_seismogram" ? "#f97316" : f.kind === "stream" ? "#22d3ee" : f.kind === "link" ? "#a78bfa" : "#e5e7eb";
              const Icon = f.kind === "raw_seismogram" ? Waves : f.kind === "stream" ? Radio : f.kind === "link" ? LinkIcon : FileText;
              const owned = userId && f.owner_id === userId;
              return (
                <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 text-[11px] hover:bg-white/[0.04]">
                  <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: iconColor }} />
                  <button onClick={() => void openFile(f)} className="flex-1 text-left min-w-0">
                    <div className="truncate text-white/90"><b>{f.name}</b></div>
                    <div className="truncate text-[10px] text-white/50 font-mono">
                      {f.kind}{f.mime_type ? ` · ${f.mime_type}` : ""} · {humanBytes(f.size_bytes)} · {new Date(f.created_at).toISOString().slice(0, 10)}
                      {f.description ? ` · ${f.description}` : ""}
                    </div>
                  </button>
                  {f.external_url && (
                    <a href={f.external_url} target="_blank" rel="noopener" className="text-white/40 hover:text-white/80" title="Open">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {f.storage_path && (
                    <button onClick={() => void openFile(f)} className="text-white/40 hover:text-white/80" title="Download">
                      <Download className="w-3 h-3" />
                    </button>
                  )}
                  {owned && (
                    <button onClick={() => void removeFile(f)} className="text-red-300/80 hover:text-red-200" title="Delete">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Streaming sources */}
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-white/60 flex items-center gap-1">
          <Radio className="w-3 h-3" /> Real-time streaming sources
        </div>
        <div className="flex flex-wrap gap-1">
          {QUAKE_STREAM_PRESETS.map((p) => (
            <button key={p.id} onClick={() => void tuneStream(p)}
              className="px-2 py-1 rounded-full text-[10px] border border-white/10 bg-white/[0.05] hover:bg-white/10 flex items-center gap-1"
              title={`${p.provider} · ${p.kind.toUpperCase()} · ${p.url}`}>
              <Radio className="w-2.5 h-2.5 text-cyan-300" />
              {p.label}
              <span className="text-white/40 font-mono">·{p.kind}</span>
            </button>
          ))}
        </div>
        <div className="text-[10px] text-white/40">
          Selecting a stream saves it to this event's library so any user can tune in later.
        </div>
      </div>

      {/* Institutional catalog */}
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-white/60 flex items-center gap-1">
            <Building2 className="w-3 h-3" /> Institutional data sources
          </div>
          <div className="flex items-center gap-1">
            {(["all", "usa", "intl"] as const).map((k) => (
              <button key={k} onClick={() => setCountryFilter(k)}
                className={`px-2 py-0.5 rounded-full text-[9px] uppercase tracking-widest border ${
                  countryFilter === k ? "bg-red-500/25 border-red-400/60 text-red-100" : "bg-white/[0.04] border-white/10 text-white/60 hover:bg-white/10"
                }`}>
                {k === "all" ? <Globe2 className="w-2.5 h-2.5 inline -mt-0.5 mr-0.5" /> : null}
                {k === "usa" ? "🇺🇸 US" : k === "intl" ? "World" : "All"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Search className="w-3 h-3 text-white/40" />
          <input value={institutionQuery} onChange={(e) => setInstitutionQuery(e.target.value)}
            placeholder="Filter by name, agency, country…"
            className="flex-1 bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-[11px]" />
        </div>
        <div className="max-h-[28vh] overflow-y-auto divide-y divide-white/[0.06] border border-white/[0.06] rounded">
          {filteredInstitutions.map((i) => (
            <div key={i.id} className="px-2 py-1.5 hover:bg-white/[0.04]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-white/90 truncate">{i.name}</div>
                  <div className="text-[10px] text-white/50 font-mono truncate">
                    {i.agency} · {i.country}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {i.kinds.map((k) => (
                      <span key={k} className="px-1.5 py-[1px] rounded-full border border-white/10 text-[9px] uppercase tracking-widest text-white/70">
                        {k}
                      </span>
                    ))}
                  </div>
                  {i.notes && <div className="text-[10px] text-white/50 mt-0.5">{i.notes}</div>}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {i.fdsnSource && onTuneSource && (
                    <button onClick={() => onTuneSource(i)}
                      className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-widest bg-red-500/20 border border-red-400/40 text-red-100 hover:bg-red-500/30">
                      Tune panel
                    </button>
                  )}
                  <a href={i.url} target="_blank" rel="noopener"
                    className="text-[10px] text-sky-300 hover:text-sky-200 inline-flex items-center gap-0.5">
                    portal <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            </div>
          ))}
          {!filteredInstitutions.length && (
            <div className="text-[11px] text-white/50 text-center py-3">No matching institutions.</div>
          )}
        </div>
      </div>
    </div>
  );
}