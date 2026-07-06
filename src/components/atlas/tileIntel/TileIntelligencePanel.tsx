/**
 * TileIntelligencePanel — Phase 2 of Tile Intelligence.
 *
 * A glass side-panel with four tabs:
 *   • Rules     — alarms bound to a geofence + data source + condition
 *   • Actions   — reusable action library (in-app / webhook / email / SMS)
 *   • Datasets  — uploads (GeoJSON, KML, CSV, GeoTIFF, model files, …) with
 *                 an ingest token for streaming data in from anywhere
 *   • Insights  — Ask / Forecast, using the user's preferred AI model
 *                 (opt-in — no AI runs otherwise)
 *
 * Persistence lives in the `tile_intel_*` and `user_datasets` tables.
 * All calls are RLS-scoped to the signed-in user; the panel gracefully
 * degrades to read-only messaging when signed out.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { X, Bell, Zap, Database, Sparkles, Trash2, Plus, KeyRound, Copy, Send, Radio, Bot } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listRules, createRule, updateRule, deleteRule, setRuleActions, listRuleActions, type Rule, type SourceKind, type Condition } from "@/lib/tileIntel/rules";
import { listActions, createAction, deleteAction, type TileAction, type ActionKind } from "@/lib/tileIntel/actions";
import { listDatasets, uploadDataset, deleteDataset, rotateIngestToken, type UserDataset } from "@/lib/tileIntel/datasets";
import { AI_MODELS, DEFAULT_MODEL, getAiPreferences, setAiPreferences } from "@/lib/tileIntel/aiPrefs";
import { listGeofences, type Geofence } from "@/lib/tileIntel/geofences";

type Tab = "rules" | "actions" | "datasets" | "insights";

interface Props {
  onClose: () => void;
  initialGeofenceId?: string | null;
}

export default function TileIntelligencePanel({ onClose, initialGeofenceId }: Props) {
  const [tab, setTab] = useState<Tab>("rules");
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [actions, setActions] = useState<TileAction[]>([]);
  const [datasets, setDatasets] = useState<UserDataset[]>([]);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);

  useEffect(() => {
    (async () => {
      const [g, r, a, d, prefs] = await Promise.all([listGeofences(), listRules(), listActions(), listDatasets(), getAiPreferences()]);
      setGeofences(g); setRules(r); setActions(a); setDatasets(d); setModel(prefs.model);
    })();
  }, []);

  useEffect(() => {
    if (initialGeofenceId) setTab("rules");
  }, [initialGeofenceId]);

  const refreshRules = async () => setRules(await listRules());
  const refreshActions = async () => setActions(await listActions());
  const refreshDatasets = async () => setDatasets(await listDatasets());

  return (
    <div className="fixed top-20 right-4 z-[70] w-[400px] max-h-[80vh] rounded-2xl overflow-hidden backdrop-blur-xl bg-black/60 border border-white/10 shadow-2xl flex flex-col text-white">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <Sparkles className="w-4 h-4 text-fuchsia-300" />
        <h2 className="text-sm font-semibold tracking-tight flex-1">Tile Intelligence</h2>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X className="w-4 h-4" /></button>
      </header>
      <nav className="flex gap-1 px-2 pt-2 text-[11px]">
        {[
          { k: "rules", i: <Bell className="w-3 h-3" />, l: "Rules" },
          { k: "actions", i: <Zap className="w-3 h-3" />, l: "Actions" },
          { k: "datasets", i: <Database className="w-3 h-3" />, l: "Datasets" },
          { k: "insights", i: <Bot className="w-3 h-3" />, l: "Insights" },
        ].map((t) => (
          <button key={t.k}
            onClick={() => setTab(t.k as Tab)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${tab === t.k ? "bg-white/15" : "hover:bg-white/[0.06]"}`}>
            {t.i}{t.l}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-auto p-3 text-[12px]">
        {tab === "rules" && (
          <RulesTab geofences={geofences} actions={actions} rules={rules} defaultGeofenceId={initialGeofenceId ?? null} datasets={datasets} onChange={refreshRules} />
        )}
        {tab === "actions" && (
          <ActionsTab actions={actions} onChange={refreshActions} />
        )}
        {tab === "datasets" && (
          <DatasetsTab datasets={datasets} onChange={refreshDatasets} />
        )}
        {tab === "insights" && (
          <InsightsTab model={model} onModelChange={async (m) => { setModel(m); await setAiPreferences({ model: m }); toast.success("AI model saved"); }} geofences={geofences} rules={rules} datasets={datasets} />
        )}
      </div>
    </div>
  );
}

/* ────────────────── Rules ────────────────── */

const SOURCES: { k: SourceKind; l: string }[] = [
  { k: "earthquake", l: "Earthquake (USGS)" },
  { k: "storm", l: "Storm (NOAA)" },
  { k: "lightning", l: "Lightning" },
  { k: "earth_layer", l: "Earth Intelligence layer" },
  { k: "dataset", l: "My dataset" },
  { k: "osm_building", l: "OSM building" },
];
const CONDS: { k: Condition; l: string }[] = [
  { k: "gt", l: ">" }, { k: "lt", l: "<" }, { k: "between", l: "between" },
  { k: "enters", l: "enters" }, { k: "exits", l: "exits" }, { k: "roc", l: "rate of change" },
];

function RulesTab({ geofences, actions, rules, defaultGeofenceId, datasets, onChange }: {
  geofences: Geofence[]; actions: TileAction[]; rules: Rule[]; defaultGeofenceId: string | null; datasets: UserDataset[]; onChange: () => Promise<void>;
}) {
  const [showNew, setShowNew] = useState(rules.length === 0);
  const [name, setName] = useState("");
  const [geofenceId, setGeofenceId] = useState<string>(defaultGeofenceId ?? "");
  const [sourceKind, setSourceKind] = useState<SourceKind>("earthquake");
  const [datasetId, setDatasetId] = useState<string>("");
  const [condition, setCondition] = useState<Condition>("gt");
  const [value, setValue] = useState("");
  const [cooldown, setCooldown] = useState(300);
  const [aiAssist, setAiAssist] = useState(false);
  const [firehose, setFirehose] = useState(false);
  const [selectedActionIds, setSelectedActionIds] = useState<string[]>([]);

  useEffect(() => { setGeofenceId(defaultGeofenceId ?? ""); }, [defaultGeofenceId]);

  const submit = async () => {
    if (!name || !geofenceId) return toast.error("Name and geofence required");
    const rule = await createRule({
      geofence_id: geofenceId, name,
      source_kind: sourceKind,
      source_ref: sourceKind === "dataset" ? { dataset_id: datasetId } : {},
      condition, threshold: { value: Number(value) },
      cooldown_s: cooldown, ai_assist: aiAssist, ai_model: null,
      firehose, enabled: true,
    });
    if (!rule) return toast.error("Sign in to save rules");
    if (selectedActionIds.length) await setRuleActions(rule.id, selectedActionIds);
    toast.success("Rule created");
    setName(""); setValue(""); setSelectedActionIds([]); setShowNew(false);
    await onChange();
  };

  return (
    <div className="space-y-3">
      {rules.length > 0 && (
        <ul className="space-y-1">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-white/[0.03] border border-white/5">
              <span className={`w-1.5 h-1.5 rounded-full ${r.enabled ? "bg-emerald-400" : "bg-white/30"}`} />
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{r.name}</div>
                <div className="text-[10px] text-white/50 truncate">{r.source_kind} · {r.condition} {JSON.stringify(r.threshold)}</div>
              </div>
              <button onClick={async () => { await updateRule(r.id, { enabled: !r.enabled } as any); await onChange(); }} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10">{r.enabled ? "On" : "Off"}</button>
              <button onClick={async () => { await deleteRule(r.id); await onChange(); }} className="p-1 rounded hover:bg-red-500/20 text-red-300"><Trash2 className="w-3 h-3" /></button>
            </li>
          ))}
        </ul>
      )}

      {!showNew ? (
        <button onClick={() => setShowNew(true)} className="w-full flex items-center justify-center gap-1 py-1.5 rounded-md bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 text-[11px]">
          <Plus className="w-3 h-3" /> New rule
        </button>
      ) : (
        <div className="space-y-2 rounded-lg p-2 bg-white/[0.04] border border-white/10">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rule name" className="w-full bg-black/40 rounded px-2 py-1 border border-white/10 text-[11px]" />
          <select value={geofenceId} onChange={(e) => setGeofenceId(e.target.value)} className="w-full bg-black/40 rounded px-2 py-1 border border-white/10 text-[11px]">
            <option value="">— pick a geofence —</option>
            {geofences.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <div className="flex gap-1">
            <select value={sourceKind} onChange={(e) => setSourceKind(e.target.value as SourceKind)} className="flex-1 bg-black/40 rounded px-2 py-1 border border-white/10 text-[11px]">
              {SOURCES.map((s) => <option key={s.k} value={s.k}>{s.l}</option>)}
            </select>
            <select value={condition} onChange={(e) => setCondition(e.target.value as Condition)} className="bg-black/40 rounded px-2 py-1 border border-white/10 text-[11px]">
              {CONDS.map((c) => <option key={c.k} value={c.k}>{c.l}</option>)}
            </select>
            <input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" className="w-20 bg-black/40 rounded px-2 py-1 border border-white/10 text-[11px]" />
          </div>
          {sourceKind === "dataset" && (
            <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)} className="w-full bg-black/40 rounded px-2 py-1 border border-white/10 text-[11px]">
              <option value="">— pick a dataset —</option>
              {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          <div className="flex items-center gap-2 text-[10px] text-white/70">
            <label>cooldown (s)<input type="number" value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))} className="ml-1 w-16 bg-black/40 rounded px-1 py-0.5 border border-white/10" /></label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={aiAssist} onChange={(e) => setAiAssist(e.target.checked)} />AI assist</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={firehose} onChange={(e) => setFirehose(e.target.checked)} />firehose</label>
          </div>
          {actions.length > 0 && (
            <div>
              <div className="text-[10px] text-white/50 mb-1">Actions</div>
              <div className="flex flex-wrap gap-1">
                {actions.map((a) => {
                  const on = selectedActionIds.includes(a.id);
                  return (
                    <button key={a.id} onClick={() => setSelectedActionIds((prev) => on ? prev.filter((x) => x !== a.id) : [...prev, a.id])}
                      className={`text-[10px] px-1.5 py-0.5 rounded ${on ? "bg-emerald-500/25 text-emerald-200" : "bg-white/5 hover:bg-white/10"}`}>
                      {a.kind} · {a.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex gap-1">
            <button onClick={submit} className="flex-1 py-1.5 rounded bg-sky-500/25 hover:bg-sky-500/40 text-sky-100 text-[11px]">Save rule</button>
            <button onClick={() => setShowNew(false)} className="px-2 py-1.5 rounded bg-white/5 hover:bg-white/10 text-[11px]">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────── Actions ────────────────── */

function ActionsTab({ actions, onChange }: { actions: TileAction[]; onChange: () => Promise<void> }) {
  const [kind, setKind] = useState<ActionKind>("in_app");
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");

  const add = async () => {
    if (!name) return;
    const config: Record<string, unknown> = {};
    if (kind === "webhook") config.url = target;
    if (kind === "email") config.to = target;
    if (kind === "sms") config.recipient = target;
    const secret = kind === "webhook" ? crypto.randomUUID() : null;
    const created = await createAction({ name, kind, config, enabled: true, secret });
    if (!created) return toast.error("Sign in to create actions");
    setName(""); setTarget(""); await onChange();
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-1">
        {actions.map((a) => (
          <li key={a.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-white/[0.03] border border-white/5">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 uppercase tracking-wide">{a.kind}</span>
            <div className="flex-1 min-w-0"><div className="truncate">{a.name}</div><div className="text-[10px] text-white/45 truncate">{JSON.stringify(a.config)}</div></div>
            <button onClick={async () => { await deleteAction(a.id); await onChange(); }} className="p-1 rounded hover:bg-red-500/20 text-red-300"><Trash2 className="w-3 h-3" /></button>
          </li>
        ))}
      </ul>
      <div className="rounded-lg p-2 bg-white/[0.04] border border-white/10 space-y-2">
        <div className="flex gap-1">
          <select value={kind} onChange={(e) => setKind(e.target.value as ActionKind)} className="bg-black/40 rounded px-2 py-1 border border-white/10 text-[11px]">
            <option value="in_app">In-app</option>
            <option value="webhook">Webhook</option>
            <option value="email">Email</option>
            <option value="sms">SMS (GatewayAPI)</option>
            <option value="pipeline">Pipeline</option>
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name" className="flex-1 bg-black/40 rounded px-2 py-1 border border-white/10 text-[11px]" />
        </div>
        {kind !== "in_app" && kind !== "pipeline" && (
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={kind === "webhook" ? "https://..." : kind === "email" ? "you@example.com" : "+14155551234"} className="w-full bg-black/40 rounded px-2 py-1 border border-white/10 text-[11px]" />
        )}
        <button onClick={add} className="w-full py-1.5 rounded bg-sky-500/25 hover:bg-sky-500/40 text-sky-100 text-[11px] flex items-center justify-center gap-1"><Plus className="w-3 h-3" /> Add action</button>
      </div>
    </div>
  );
}

/* ────────────────── Datasets ────────────────── */

function DatasetsTab({ datasets, onChange }: { datasets: UserDataset[]; onChange: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const ingestBase = useMemo(() => `${(import.meta as any).env?.VITE_SUPABASE_URL || ""}/functions/v1/tile-intel-ingest`, []);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    try { await uploadDataset(file); toast.success("Uploaded"); await onChange(); }
    catch (err) { toast.error(String((err as any)?.message ?? err)); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg p-2 bg-white/[0.04] border border-white/10">
        <div className="text-[10px] text-white/60 mb-1">Upload GeoJSON, KML/KMZ, Shapefile .zip, CSV (lat/lon), GeoTIFF, NetCDF, GPX, JSON, or model files (.onnx / .pt / .pkl).</div>
        <input ref={inputRef} type="file" onChange={onFile} disabled={busy}
          accept=".geojson,.json,.kml,.kmz,.zip,.csv,.tsv,.tif,.tiff,.nc,.gpx,.onnx,.pt,.pkl,.joblib,.pb,.h5"
          className="text-[11px] file:mr-2 file:rounded file:border-0 file:bg-sky-500/25 file:text-sky-100 file:px-2 file:py-1 file:text-[11px]" />
      </div>
      <ul className="space-y-1">
        {datasets.map((d) => (
          <li key={d.id} className="rounded-md px-2 py-1.5 bg-white/[0.03] border border-white/5 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 uppercase">{d.kind}</span>
              <div className="flex-1 min-w-0"><div className="truncate font-medium">{d.name}</div><div className="text-[10px] text-white/45">{d.sample_count} pts · {d.bbox ? "geo" : "no bbox"}</div></div>
              <button onClick={async () => { await deleteDataset(d); await onChange(); }} className="p-1 rounded hover:bg-red-500/20 text-red-300"><Trash2 className="w-3 h-3" /></button>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-white/60">
              <Radio className="w-3 h-3" />
              <code className="truncate flex-1 text-white/70">{ingestBase}?token={d.ingest_token.slice(0, 8)}…</code>
              <button onClick={() => { navigator.clipboard.writeText(`${ingestBase}?token=${d.ingest_token}`); toast.success("Ingest URL copied"); }} className="p-1 rounded hover:bg-white/10"><Copy className="w-3 h-3" /></button>
              <button onClick={async () => { await rotateIngestToken(d.id); await onChange(); toast.success("Token rotated"); }} className="p-1 rounded hover:bg-white/10"><KeyRound className="w-3 h-3" /></button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ────────────────── Insights ────────────────── */

function InsightsTab({ model, onModelChange, geofences, rules, datasets }: {
  model: string; onModelChange: (m: string) => void;
  geofences: Geofence[]; rules: Rule[]; datasets: UserDataset[];
}) {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  const ask = async (mode: "chat" | "forecast") => {
    if (mode === "chat" && !prompt.trim()) return;
    setBusy(true); setAnswer("");
    try {
      const url = `${(import.meta as any).env?.VITE_SUPABASE_URL}/functions/v1/tile-intel-ask`;
      const { data: sess } = await supabase.auth.getSession();
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
          Authorization: `Bearer ${sess.session?.access_token ?? (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ?? ""}`,
        },
        body: JSON.stringify({
          model, mode,
          messages: mode === "chat" ? [{ role: "user", content: prompt }] : [{ role: "user", content: "Forecast next 24 hours." }],
          context: { geofences: geofences.map((g) => ({ id: g.id, name: g.name, tiles: g.tile_set.length })), rules: rules.map((r) => ({ id: r.id, name: r.name, source_kind: r.source_kind, condition: r.condition, threshold: r.threshold })), datasets: datasets.map((d) => ({ id: d.id, name: d.name, kind: d.kind, count: d.sample_count })) },
        }),
      });
      if (!r.ok || !r.body) { toast.error(`AI error ${r.status}`); return; }
      const reader = r.body.getReader(); const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        // Parse SSE lines
        const parts = buf.split("\n"); buf = parts.pop() ?? "";
        for (const line of parts) {
          const s = line.trim(); if (!s.startsWith("data:")) continue;
          const payload = s.slice(5).trim(); if (payload === "[DONE]") continue;
          try { const j = JSON.parse(payload); const delta = j.choices?.[0]?.delta?.content; if (delta) setAnswer((a) => a + delta); } catch { /* noop */ }
        }
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg p-2 bg-white/[0.04] border border-white/10">
        <div className="text-[10px] text-white/60 mb-1 flex items-center gap-1"><Bot className="w-3 h-3" /> Background AI model</div>
        <select value={model} onChange={(e) => onModelChange(e.target.value)} className="w-full bg-black/40 rounded px-2 py-1 border border-white/10 text-[11px]">
          {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <div className="mt-1 text-[10px] text-white/45">AI runs only when you ask, forecast, or enable it on a specific rule.</div>
      </div>
      <div className="rounded-lg p-2 bg-white/[0.04] border border-white/10 space-y-2">
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="Ask about your geofences, rules, or datasets…" className="w-full bg-black/40 rounded px-2 py-1 border border-white/10 text-[11px] resize-none" />
        <div className="flex gap-1">
          <button disabled={busy} onClick={() => ask("chat")} className="flex-1 py-1.5 rounded bg-sky-500/25 hover:bg-sky-500/40 disabled:opacity-40 text-sky-100 text-[11px] flex items-center justify-center gap-1"><Send className="w-3 h-3" />Ask</button>
          <button disabled={busy} onClick={() => ask("forecast")} className="flex-1 py-1.5 rounded bg-fuchsia-500/25 hover:bg-fuchsia-500/40 disabled:opacity-40 text-fuchsia-100 text-[11px] flex items-center justify-center gap-1"><Sparkles className="w-3 h-3" />Forecast 24h</button>
        </div>
        {answer && (
          <pre className="text-[11px] whitespace-pre-wrap text-white/85 max-h-64 overflow-auto rounded bg-black/40 p-2 border border-white/5">{answer}</pre>
        )}
      </div>
    </div>
  );
}