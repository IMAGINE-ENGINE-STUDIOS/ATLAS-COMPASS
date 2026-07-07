import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import {
  X, ScanLine, Camera, Bell, MapPin, Upload, Radio, Shield,
  Trash2, Plus, Copy, CheckCircle2, Loader2, KeyRound, Search, ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLPRSettings, useIsAtlasAdmin, type LPRSettings } from "@/hooks/useLPR";
import LPRComplianceGate from "./LPRComplianceGate";

type Tab = "settings" | "cameras" | "watchlist" | "reads" | "track" | "hits" | "admin";

interface Read {
  id: string; plate: string; confidence: number | null;
  lat: number | null; lng: number | null; epoch_ms: number;
  camera_id: string | null; vehicle_make: string | null; vehicle_model: string | null;
  vehicle_color: string | null; image_url: string | null;
}

interface Camera {
  id: string; label: string; kind: "network" | "user_ip" | "manual_upload";
  agent_uid: string | null; lat: number | null; lng: number | null;
  active: boolean; last_seen_at: string | null;
}

interface Watch { id: string; plate: string; label: string | null; notify: boolean; color: string }
interface Hit { id: string; plate: string; hit_at: string; geofence_id: string | null; read_id: string | null; acknowledged: boolean }

interface AccessRequest {
  id: string; user_id: string; requester_name: string; organization: string | null;
  contact_email: string; purpose: string; jurisdictions: string | null;
  status: "pending" | "approved" | "rejected" | "revoked";
  admin_notes: string | null; created_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  viewer?: any;
  flyTo?: (lat: number, lng: number) => void;
}

const WEBHOOK_BASE = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/functions/v1/lpr-webhook`;

export default function LPRPanel({ open, onClose, flyTo }: Props) {
  const { settings, loading, reload, update } = useLPRSettings();
  const isAdmin = useIsAtlasAdmin();
  const [tab, setTab] = useState<Tab>("cameras");
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [reads, setReads] = useState<Read[]>([]);
  const [watch, setWatch] = useState<Watch[]>([]);
  const [hits, setHits] = useState<Hit[]>([]);

  const loadAll = useCallback(async () => {
    const [c, r, w, h] = await Promise.all([
      supabase.from("lpr_cameras").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("lpr_plate_reads").select("id, plate, confidence, lat, lng, epoch_ms, camera_id, vehicle_make, vehicle_model, vehicle_color, image_url").order("epoch_ms", { ascending: false }).limit(200),
      supabase.from("lpr_watchlist").select("*").order("created_at", { ascending: false }),
      supabase.from("lpr_geofence_hits").select("*").order("hit_at", { ascending: false }).limit(100),
    ]);
    setCameras((c.data ?? []) as any);
    setReads((r.data ?? []) as any);
    setWatch((w.data ?? []) as any);
    setHits((h.data ?? []) as any);
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadAll();
    const ch = supabase.channel("lpr_realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lpr_plate_reads" }, (p) => {
        setReads((prev) => [p.new as any, ...prev].slice(0, 200));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lpr_geofence_hits" }, (p) => {
        const row = p.new as any;
        setHits((prev) => [row, ...prev].slice(0, 100));
        toast.warning(`LPR hit: ${row.plate}`, { description: "Watchlist or geofence match." });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [open, loadAll]);

  if (!open) return null;

  return (
    <div className="fixed top-[80px] right-4 bottom-4 w-[420px] max-w-[calc(100vw-2rem)] z-[70] rounded-2xl border border-white/10 bg-slate-950/95 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <ScanLine className="w-4 h-4 text-cyan-300" />
          <div className="text-[13px] font-bold uppercase tracking-widest">License Plate Readers</div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X className="w-4 h-4" /></button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-white/60 text-[12px]">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
        </div>
      ) : !settings?.legal_ack_at ? (
        <div className="relative flex-1">
          <LPRComplianceGate onAcknowledged={() => reload()} />
        </div>
      ) : (
        <>
          <TabBar tab={tab} setTab={setTab} isAdmin={isAdmin} hitsUnread={hits.filter(h => !h.acknowledged).length} />
          <div className="flex-1 overflow-y-auto p-3 text-white/90 text-[12px]">
            {tab === "settings" && <SettingsTab settings={settings!} update={update} isAdmin={isAdmin} />}
            {tab === "cameras" && <CamerasTab cameras={cameras} reload={loadAll} settings={settings!} />}
            {tab === "watchlist" && <WatchlistTab watch={watch} reload={loadAll} />}
            {tab === "reads" && <ReadsTab reads={reads} flyTo={flyTo} />}
            {tab === "track" && <TrackTab flyTo={flyTo} />}
            {tab === "hits" && <HitsTab hits={hits} reload={loadAll} flyTo={flyTo} reads={reads} />}
            {tab === "admin" && isAdmin && <AdminTab />}
          </div>
          <div className="px-3 py-1.5 border-t border-white/10 text-[9px] text-white/40 flex items-center justify-between">
            <span>Reads shown are only from cameras your account has access to.</span>
            <span>{settings!.requests_today} / {settings!.daily_request_cap} today</span>
          </div>
        </>
      )}
    </div>
  );
}

/* ============ Tabs ============ */

function TabBar({ tab, setTab, isAdmin, hitsUnread }: { tab: Tab; setTab: (t: Tab) => void; isAdmin: boolean; hitsUnread: number }) {
  const items: Array<{ id: Tab; icon: JSX.Element; label: string; badge?: number }> = [
    { id: "cameras", icon: <Camera className="w-3.5 h-3.5" />, label: "Cameras" },
    { id: "watchlist", icon: <Bell className="w-3.5 h-3.5" />, label: "Watch" },
    { id: "reads", icon: <ScanLine className="w-3.5 h-3.5" />, label: "Reads" },
    { id: "track", icon: <Search className="w-3.5 h-3.5" />, label: "Track" },
    { id: "hits", icon: <MapPin className="w-3.5 h-3.5" />, label: "Hits", badge: hitsUnread || undefined },
    { id: "settings", icon: <KeyRound className="w-3.5 h-3.5" />, label: "Access" },
  ];
  if (isAdmin) items.push({ id: "admin", icon: <Shield className="w-3.5 h-3.5" />, label: "Admin" });
  return (
    <div className="flex items-center gap-0.5 px-2 pt-2 pb-1 border-b border-white/10 overflow-x-auto">
      {items.map((it) => (
        <button key={it.id} onClick={() => setTab(it.id)}
          className={`relative flex items-center gap-1 h-7 px-2 rounded-md text-[10px] uppercase tracking-wider whitespace-nowrap transition-colors ${tab === it.id ? "bg-cyan-500/20 text-cyan-200" : "text-white/60 hover:text-white hover:bg-white/5"}`}>
          {it.icon} {it.label}
          {it.badge ? <span className="ml-1 min-w-[14px] h-3.5 px-1 rounded-full bg-rose-500 text-[8px] font-bold text-white flex items-center justify-center">{it.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ---- Settings / Access mode ---- */

function SettingsTab({ settings, update, isAdmin }: { settings: LPRSettings; update: (p: Partial<LPRSettings>) => Promise<void>; isAdmin: boolean }) {
  const [byok, setByok] = useState(settings.byok_api_key ?? "");
  const [saving, setSaving] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);
  const [existingReq, setExistingReq] = useState<AccessRequest | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return;
      const { data } = await supabase
        .from("lpr_access_requests")
        .select("*")
        .eq("user_id", u.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setExistingReq((data ?? null) as any);
    })();
  }, [settings.access_mode]);

  const setMode = async (mode: LPRSettings["access_mode"]) => {
    if (mode === "admin" && !isAdmin) { toast.error("Atlas Admin role required"); return; }
    if (mode === "platform" && !settings.platform_approved) { toast.error("Not yet approved — request access first"); return; }
    setSaving(true);
    await update({ access_mode: mode });
    setSaving(false);
  };

  const saveByok = async () => {
    setSaving(true);
    await update({ byok_api_key: byok || null });
    setSaving(false);
    toast.success("BYOK key saved");
  };

  return (
    <div className="space-y-4">
      <div className="text-[11px] text-white/60">Choose how your Atlas account authenticates against Rekor Scout / OpenALPR.</div>
      <div className="grid grid-cols-1 gap-2">
        <ModeCard
          active={settings.access_mode === "admin"}
          disabled={!isAdmin}
          onClick={() => setMode("admin")}
          badge="Admin"
          title="Atlas Admin key"
          tone="cyan"
          body={isAdmin ? "You have Atlas Admin role — full access to the shared platform key." : "Requires Atlas Admin role."}
        />
        <ModeCard
          active={settings.access_mode === "platform"}
          disabled={!settings.platform_approved}
          onClick={() => setMode("platform")}
          badge={settings.platform_approved ? "Approved" : "Not approved"}
          title="Platform-provided access"
          tone="emerald"
          body={settings.platform_approved ? "Approved by an Atlas Admin — uses the platform Rekor key." : "Submit a request; an Atlas Admin will review your use case."}
          extra={!settings.platform_approved && (
            <button onClick={() => setReqOpen(true)} className="mt-2 h-7 px-3 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-[10px] font-bold uppercase tracking-wider">
              {existingReq?.status === "pending" ? "Request pending" : existingReq?.status === "rejected" ? "Resubmit request" : "Request access"}
            </button>
          )}
        />
        <ModeCard
          active={settings.access_mode === "byok"}
          onClick={() => setMode("byok")}
          badge="BYOK"
          title="Your own Rekor API key"
          tone="amber"
          body="You supply a Rekor Cloud secret_key and take full legal responsibility for use."
          extra={
            <div className="mt-2 flex items-center gap-1.5">
              <input
                type="password"
                value={byok}
                onChange={(e) => setByok(e.target.value)}
                placeholder="sk_live_xxx… from cloud.openalpr.com"
                className="flex-1 h-7 px-2 rounded bg-black/40 border border-white/10 text-[11px] focus:outline-none focus:border-amber-400/60"
              />
              <button onClick={saveByok} disabled={saving} className="h-7 px-3 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[10px] font-bold uppercase tracking-wider disabled:opacity-40">Save</button>
            </div>
          }
        />
      </div>

      {reqOpen && <RequestAccessModal onClose={() => { setReqOpen(false); }} existing={existingReq} onSubmitted={(r) => { setExistingReq(r); toast.success("Request submitted"); }} />}
    </div>
  );
}

function ModeCard({ active, disabled, onClick, badge, title, body, tone, extra }: {
  active: boolean; disabled?: boolean; onClick: () => void; badge: string;
  title: string; body: string; tone: "cyan" | "emerald" | "amber"; extra?: React.ReactNode;
}) {
  const ring = tone === "cyan" ? "ring-cyan-400/60 bg-cyan-500/10" : tone === "emerald" ? "ring-emerald-400/60 bg-emerald-500/10" : "ring-amber-400/60 bg-amber-500/10";
  const chip = tone === "cyan" ? "bg-cyan-500/20 text-cyan-200" : tone === "emerald" ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200";
  return (
    <div className={`rounded-lg border p-3 transition-all ${active ? `border-transparent ring-2 ${ring}` : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"} ${disabled ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <button onClick={onClick} disabled={disabled} className="text-left flex-1 disabled:cursor-not-allowed">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${chip}`}>{badge}</span>
            <span className="text-[12px] font-semibold">{title}</span>
            {active && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 ml-auto" />}
          </div>
          <div className="text-[10.5px] text-white/60 leading-relaxed">{body}</div>
        </button>
      </div>
      {extra}
    </div>
  );
}

function RequestAccessModal({ onClose, existing, onSubmitted }: { onClose: () => void; existing: AccessRequest | null; onSubmitted: (r: AccessRequest) => void }) {
  const [name, setName] = useState(existing?.requester_name ?? "");
  const [org, setOrg] = useState(existing?.organization ?? "");
  const [email, setEmail] = useState(existing?.contact_email ?? "");
  const [purpose, setPurpose] = useState(existing?.purpose ?? "");
  const [jur, setJur] = useState(existing?.jurisdictions ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || !email.trim() || !purpose.trim()) { toast.error("Name, email, and purpose are required"); return; }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) { setBusy(false); return; }
    const { data, error } = await supabase.from("lpr_access_requests").insert({
      user_id: u.user.id,
      requester_name: name.trim(),
      organization: org.trim() || null,
      contact_email: email.trim(),
      purpose: purpose.trim(),
      jurisdictions: jur.trim() || null,
    }).select("*").single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    onSubmitted(data as any);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[95] bg-black/70 backdrop-blur flex items-center justify-center p-6" onClick={onClose}>
      <div className="max-w-md w-full rounded-2xl border border-emerald-500/30 bg-slate-950 p-5 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="text-[13px] font-bold mb-3">Request platform LPR access</div>
        <div className="space-y-2 text-[11px]">
          <Field label="Full name"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-8 px-2 rounded bg-black/40 border border-white/10 focus:outline-none focus:border-emerald-400/60" /></Field>
          <Field label="Organization (optional)"><input value={org} onChange={(e) => setOrg(e.target.value)} className="w-full h-8 px-2 rounded bg-black/40 border border-white/10 focus:outline-none focus:border-emerald-400/60" /></Field>
          <Field label="Contact email"><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="w-full h-8 px-2 rounded bg-black/40 border border-white/10 focus:outline-none focus:border-emerald-400/60" /></Field>
          <Field label="Jurisdictions (states/countries)"><input value={jur} onChange={(e) => setJur(e.target.value)} className="w-full h-8 px-2 rounded bg-black/40 border border-white/10 focus:outline-none focus:border-emerald-400/60" /></Field>
          <Field label="Purpose / permissible-purpose basis">
            <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={4} className="w-full px-2 py-1.5 rounded bg-black/40 border border-white/10 focus:outline-none focus:border-emerald-400/60" />
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button onClick={onClose} className="flex-1 h-8 rounded bg-white/5 hover:bg-white/10 text-[11px]">Cancel</button>
          <button onClick={submit} disabled={busy} className="flex-1 h-8 rounded bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] font-bold disabled:opacity-40">{busy ? "Submitting…" : "Submit"}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[9px] uppercase tracking-widest text-white/50 mb-0.5">{label}</div>
      {children}
    </label>
  );
}

/* ---- Cameras ---- */

function CamerasTab({ cameras, reload, settings }: { cameras: Camera[]; reload: () => Promise<void>; settings: LPRSettings }) {
  const [label, setLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const webhookUrl = `${WEBHOOK_BASE}?u=${settings.user_id}`;

  const addManual = async () => {
    if (!label.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return;
    await supabase.from("lpr_cameras").insert({ user_id: u.user.id, label: label.trim(), kind: "manual_upload" });
    setLabel("");
    await reload();
  };

  const remove = async (id: string) => {
    await supabase.from("lpr_cameras").delete().eq("id", id);
    await reload();
  };

  const uploadImage = async (file: File, cameraId?: string) => {
    setUploading(true);
    try {
      const reader = new FileReader();
      const b64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { data, error } = await supabase.functions.invoke("lpr-recognize", {
        body: { image_base64: b64, camera_id: cameraId },
      });
      if (error) throw new Error(error.message);
      const plates = (data as any)?.plates ?? [];
      if (!plates.length) toast.warning("No plates detected");
      else toast.success(`Detected ${plates.length} plate${plates.length > 1 ? "s" : ""}: ${plates.map((p: any) => p.plate).join(", ")}`);
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <div className="text-[10px] uppercase tracking-widest text-white/50 mb-2">Rekor agent webhook</div>
        <div className="text-[10px] text-white/60 mb-2">Paste this in your Rekor account → Data Destinations → Webhook. Set the shared secret to your webhook secret below.</div>
        <div className="flex items-center gap-1.5">
          <code className="flex-1 h-7 px-2 rounded bg-black/60 border border-white/10 text-[10px] font-mono truncate flex items-center">{webhookUrl}</code>
          <button onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("Copied"); }} className="h-7 px-2 rounded bg-white/5 hover:bg-white/10"><Copy className="w-3 h-3" /></button>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <code className="flex-1 h-7 px-2 rounded bg-black/60 border border-white/10 text-[10px] font-mono truncate flex items-center">{settings.webhook_secret}</code>
          <button onClick={() => { navigator.clipboard.writeText(settings.webhook_secret); toast.success("Copied"); }} className="h-7 px-2 rounded bg-white/5 hover:bg-white/10"><Copy className="w-3 h-3" /></button>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <div className="text-[10px] uppercase tracking-widest text-white/50 mb-2">Recognize a still image</div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f); }} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading} className="w-full h-8 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 text-[11px] font-bold uppercase tracking-wider disabled:opacity-40 flex items-center justify-center gap-1.5">
          {uploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</> : <><Upload className="w-3.5 h-3.5" /> Choose image</>}
        </button>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <div className="flex items-center gap-1.5">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="New camera label" className="flex-1 h-7 px-2 rounded bg-black/40 border border-white/10 text-[11px] focus:outline-none focus:border-cyan-400/60" />
          <button onClick={addManual} className="h-7 px-2 rounded bg-white/5 hover:bg-white/10"><Plus className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      <div className="space-y-1.5">
        {cameras.length === 0 && <div className="text-[11px] text-white/40 text-center py-4">No cameras yet.</div>}
        {cameras.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5">
            {c.kind === "network" ? <Radio className="w-3.5 h-3.5 text-emerald-300" /> : c.kind === "user_ip" ? <Camera className="w-3.5 h-3.5 text-sky-300" /> : <Upload className="w-3.5 h-3.5 text-amber-300" />}
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold truncate">{c.label}</div>
              <div className="text-[9px] text-white/50 truncate">{c.agent_uid ?? c.kind} · {c.last_seen_at ? new Date(c.last_seen_at).toLocaleString() : "never"}</div>
            </div>
            <button onClick={() => remove(c.id)} className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-rose-300"><Trash2 className="w-3 h-3" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Watchlist ---- */

function WatchlistTab({ watch, reload }: { watch: Watch[]; reload: () => Promise<void> }) {
  const [plate, setPlate] = useState("");
  const [label, setLabel] = useState("");

  const add = async () => {
    const p = plate.toUpperCase().replace(/\s/g, "");
    if (p.length < 2) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return;
    const { error } = await supabase.from("lpr_watchlist").insert({ user_id: u.user.id, plate: p, label: label || null });
    if (error) { toast.error(error.message); return; }
    setPlate(""); setLabel("");
    await reload();
  };

  const remove = async (id: string) => { await supabase.from("lpr_watchlist").delete().eq("id", id); await reload(); };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 flex items-center gap-1.5">
        <input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="PLATE" className="w-24 h-7 px-2 rounded bg-black/40 border border-white/10 text-[11px] font-mono tracking-wider focus:outline-none focus:border-rose-400/60" />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" className="flex-1 h-7 px-2 rounded bg-black/40 border border-white/10 text-[11px] focus:outline-none focus:border-rose-400/60" />
        <button onClick={add} className="h-7 px-2 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200"><Plus className="w-3.5 h-3.5" /></button>
      </div>
      <div className="space-y-1.5">
        {watch.length === 0 && <div className="text-[11px] text-white/40 text-center py-4">No watched plates.</div>}
        {watch.map((w) => (
          <div key={w.id} className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-2.5 py-1.5">
            <span className="text-[12px] font-mono font-bold tracking-wider text-rose-200">{w.plate}</span>
            <span className="flex-1 truncate text-[10px] text-white/60">{w.label ?? ""}</span>
            <button onClick={() => remove(w.id)} className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-rose-300"><Trash2 className="w-3 h-3" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Recent reads ---- */

function ReadsTab({ reads, flyTo }: { reads: Read[]; flyTo?: (lat: number, lng: number) => void }) {
  if (reads.length === 0) return <div className="text-[11px] text-white/40 text-center py-8">No plate reads yet.</div>;
  return (
    <div className="space-y-1.5">
      {reads.map((r) => (
        <button key={r.id} onClick={() => r.lat != null && r.lng != null && flyTo?.(r.lat, r.lng)} className="w-full text-left rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] px-2.5 py-1.5 flex items-center gap-2">
          <span className="text-[12px] font-mono font-bold tracking-wider text-cyan-200 min-w-[70px]">{r.plate}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-white/70 truncate">
              {[r.vehicle_color, r.vehicle_make, r.vehicle_model].filter(Boolean).join(" ") || "—"}
            </div>
            <div className="text-[9px] text-white/40">{new Date(r.epoch_ms).toLocaleString()} · {r.confidence ? `${r.confidence.toFixed(1)}%` : "—"}</div>
          </div>
          {r.lat != null && r.lng != null && <MapPin className="w-3 h-3 text-white/40" />}
        </button>
      ))}
    </div>
  );
}

/* ---- Track plate ---- */

function TrackTab({ flyTo }: { flyTo?: (lat: number, lng: number) => void }) {
  const [plate, setPlate] = useState("");
  const [hours, setHours] = useState(24);
  const [includeNetwork, setIncludeNetwork] = useState(false);
  const [busy, setBusy] = useState(false);
  const [route, setRoute] = useState<Read[]>([]);

  const search = async () => {
    if (plate.trim().length < 2) return;
    setBusy(true);
    setRoute([]);
    try {
      const { data, error } = await supabase.functions.invoke("lpr-history", { body: { plate: plate.trim(), hours, include_network: includeNetwork } });
      if (error) throw new Error(error.message);
      setRoute(((data as any)?.reads ?? []) as Read[]);
      window.dispatchEvent(new CustomEvent("atlas:lpr-route", { detail: { plate, reads: (data as any)?.reads ?? [] } }));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="PLATE" className="flex-1 h-8 px-2 rounded bg-black/40 border border-white/10 text-[12px] font-mono tracking-wider focus:outline-none focus:border-cyan-400/60" />
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="h-8 px-1.5 rounded bg-black/40 border border-white/10 text-[10px]">
            <option value={1}>1h</option><option value={24}>24h</option><option value={168}>7d</option><option value={720}>30d</option>
          </select>
          <button onClick={search} disabled={busy} className="h-8 px-3 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 text-[11px] font-bold uppercase tracking-wider disabled:opacity-40">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Track"}
          </button>
        </div>
        <label className="flex items-center gap-1.5 text-[10px] text-white/60 cursor-pointer">
          <input type="checkbox" checked={includeNetwork} onChange={(e) => setIncludeNetwork(e.target.checked)} />
          Include full Rekor network (Admin / Platform only)
        </label>
      </div>
      {route.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-white/50 mb-1">{route.length} reads</div>
          <div className="space-y-1">
            {route.slice(0, 100).map((r) => (
              <button key={r.id} onClick={() => r.lat != null && r.lng != null && flyTo?.(r.lat, r.lng)} className="w-full text-left rounded border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] px-2 py-1 flex items-center gap-2">
                <span className="text-[10px] font-mono text-cyan-200">{new Date(r.epoch_ms).toLocaleString()}</span>
                <span className="ml-auto text-[9px] text-white/50">{r.lat?.toFixed(4)}, {r.lng?.toFixed(4)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Hits ---- */

function HitsTab({ hits, reload, flyTo, reads }: { hits: Hit[]; reload: () => Promise<void>; flyTo?: (lat: number, lng: number) => void; reads: Read[] }) {
  const readMap = useMemo(() => new Map(reads.map((r) => [r.id, r])), [reads]);
  const ack = async (id: string) => { await supabase.from("lpr_geofence_hits").update({ acknowledged: true }).eq("id", id); await reload(); };
  if (hits.length === 0) return <div className="text-[11px] text-white/40 text-center py-8">No geofence or watchlist hits yet.</div>;
  return (
    <div className="space-y-1.5">
      {hits.map((h) => {
        const r = h.read_id ? readMap.get(h.read_id) : undefined;
        return (
          <div key={h.id} className={`rounded-lg border px-2.5 py-1.5 flex items-center gap-2 ${h.acknowledged ? "border-white/10 bg-white/[0.02]" : "border-rose-500/40 bg-rose-500/10"}`}>
            <span className="text-[12px] font-mono font-bold tracking-wider text-rose-200">{h.plate}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-white/70 truncate">{h.geofence_id ? "Geofence match" : "Watchlist match"}</div>
              <div className="text-[9px] text-white/40">{new Date(h.hit_at).toLocaleString()}</div>
            </div>
            {r?.lat != null && r?.lng != null && (
              <button onClick={() => flyTo?.(r.lat!, r.lng!)} className="p-1 rounded hover:bg-white/10 text-white/60"><MapPin className="w-3 h-3" /></button>
            )}
            {!h.acknowledged && (
              <button onClick={() => ack(h.id)} className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 uppercase tracking-widest">Ack</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---- Admin ---- */

function AdminTab() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("lpr-admin", { method: "GET" as any });
    if (error) { toast.error(error.message); return; }
    setRequests(((data as any)?.requests ?? []) as AccessRequest[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const decide = async (id: string, action: "approve" | "reject") => {
    setBusy(id);
    const { error } = await supabase.functions.invoke("lpr-admin", { body: { action, id } });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Request ${action}d`);
    await load();
  };

  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-white/50">Platform access requests</div>
      {requests.length === 0 && <div className="text-[11px] text-white/40 text-center py-4">No requests.</div>}
      {requests.map((r) => (
        <div key={r.id} className={`rounded-lg border p-2.5 ${r.status === "pending" ? "border-amber-500/40 bg-amber-500/[0.06]" : r.status === "approved" ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-white/10 bg-white/[0.02]"}`}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="text-[12px] font-semibold">{r.requester_name}</div>
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${r.status === "pending" ? "bg-amber-500/25 text-amber-200" : r.status === "approved" ? "bg-emerald-500/25 text-emerald-200" : "bg-rose-500/25 text-rose-200"}`}>{r.status}</span>
          </div>
          <div className="text-[10px] text-white/60">{r.organization ?? "—"} · {r.contact_email}</div>
          {r.jurisdictions && <div className="text-[10px] text-white/50">Jurisdictions: {r.jurisdictions}</div>}
          <div className="text-[10.5px] text-white/70 mt-1 whitespace-pre-wrap">{r.purpose}</div>
          {r.status === "pending" && (
            <div className="mt-2 flex items-center gap-1.5">
              <button onClick={() => decide(r.id, "approve")} disabled={busy === r.id} className="flex-1 h-7 rounded bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-bold uppercase tracking-widest disabled:opacity-40">Approve</button>
              <button onClick={() => decide(r.id, "reject")} disabled={busy === r.id} className="flex-1 h-7 rounded bg-rose-500/80 hover:bg-rose-500 text-white text-[10px] font-bold uppercase tracking-widest disabled:opacity-40">Reject</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}