/**
 * TileIntelligencePanel — full Tile Intelligence workspace, redesigned to
 * match the Earth Intelligence visual language.
 *
 *   • Rules      — rich alarm builder: geofence scoping, source, condition,
 *                  schedule, severity, actions, opt-in AI helper.
 *   • Heatmaps   — one-click heatmaps from uploaded datasets or from a
 *                  curated live GIS catalog (USGS quakes, NASA fires,
 *                  OpenAQ air quality, NWS alerts, GDACS, world cities…).
 *   • Datasets   — upload GeoJSON / KML / CSV / GeoTIFF / models plus a
 *                  private ingest URL for streaming external data in.
 *   • Actions    — in-app / webhook / email / SMS (GatewayAPI) / pipeline
 *                  library with per-kind config editors.
 *   • AI         — opt-in assistant using the user's preferred model.
 *
 * AI never runs in the background — only when the user asks, forecasts,
 * or enables "AI helper on each fire" on a specific rule.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  X, Bell, Zap, Database, Sparkles, Trash2, Plus, KeyRound, Copy, Send,
  Radio, Bot, Flame, Clock, ShieldAlert, Info, Play, Pause, Layers, Search,
  Check, Waves,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listRules, createRule, updateRule, deleteRule, setRuleActions,
  type Rule, type SourceKind, type Condition,
} from "@/lib/tileIntel/rules";
import {
  listActions, createAction, deleteAction,
  type TileAction, type ActionKind,
} from "@/lib/tileIntel/actions";
import {
  listDatasets, uploadDataset, deleteDataset, rotateIngestToken,
  type UserDataset,
} from "@/lib/tileIntel/datasets";
import {
  AI_MODELS, DEFAULT_MODEL, getAiPreferences, setAiPreferences,
} from "@/lib/tileIntel/aiPrefs";
import { listGeofences, type Geofence } from "@/lib/tileIntel/geofences";
import {
  LIVE_GIS_SOURCES, HEAT_RAMPS, sampleRamp, type HeatCategory,
} from "@/lib/tileIntel/liveGis";
import {
  listHeatmaps, upsertHeatmap, deleteHeatmap, toggleHeatmap, newHeatmap,
  type HeatmapConfig,
} from "@/lib/tileIntel/heatmaps";
import { runPipeline } from "@/lib/tileIntel/pipeline";

type Tab = "rules" | "heatmaps" | "datasets" | "actions" | "insights";

interface Props { onClose: () => void; initialGeofenceId?: string | null; }

const glass = "rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm";
const btnPrimary = "px-2.5 py-1.5 rounded-md bg-cyan-500/25 hover:bg-cyan-500/40 text-cyan-100 text-[11px] font-medium transition-colors";
const btnGhost = "px-2.5 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/80 text-[11px] transition-colors";

export default function TileIntelligencePanel({ onClose, initialGeofenceId }: Props) {
  const [tab, setTab] = useState<Tab>("rules");
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [actions, setActions] = useState<TileAction[]>([]);
  const [datasets, setDatasets] = useState<UserDataset[]>([]);
  const [heatmaps, setHeatmaps] = useState<HeatmapConfig[]>(() => listHeatmaps());
  const [model, setModel] = useState<string>(DEFAULT_MODEL);

  useEffect(() => {
    (async () => {
      const [g, r, a, d, prefs] = await Promise.all([
        listGeofences(), listRules(), listActions(), listDatasets(), getAiPreferences(),
      ]);
      setGeofences(g); setRules(r); setActions(a); setDatasets(d); setModel(prefs.model);
    })();
    const onH = () => setHeatmaps(listHeatmaps());
    window.addEventListener("atlas:heatmaps-changed", onH);
    const onWorld = async () => {
      const [g, d] = await Promise.all([listGeofences(), listDatasets()]);
      setGeofences(g); setDatasets(d);
    };
    window.addEventListener("atlas:world-changed", onWorld);
    return () => {
      window.removeEventListener("atlas:heatmaps-changed", onH);
      window.removeEventListener("atlas:world-changed", onWorld);
    };
  }, []);

  useEffect(() => { if (initialGeofenceId) setTab("rules"); }, [initialGeofenceId]);

  const refreshRules = async () => setRules(await listRules());
  const refreshActions = async () => setActions(await listActions());
  const refreshDatasets = async () => setDatasets(await listDatasets());
  const refreshHeatmaps = () => setHeatmaps(listHeatmaps());

  return (
    <div data-draggable-window className="fixed top-20 right-4 z-[70] w-[520px] max-h-[82vh] rounded-2xl overflow-hidden backdrop-blur-xl bg-black/70 border border-white/15 shadow-2xl flex flex-col text-white animate-in fade-in slide-in-from-right-2 duration-200">
      <header data-drag-handle className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-gradient-to-r from-cyan-500/10 via-transparent to-fuchsia-500/10 cursor-move select-none">
        <Sparkles className="w-4 h-4 text-cyan-200" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold tracking-widest uppercase text-cyan-200">Tile Intelligence</div>
          <div className="text-[10px] text-white/50">Rules, heatmaps, live GIS &amp; datasets</div>
        </div>
        <div className="flex items-center gap-1 mr-1 rounded-md border border-white/10 bg-black/40 pl-1.5 pr-0.5 py-0.5"
          title="Preferred AI model — only runs when you ask, forecast, or opt in on a rule">
          <Bot className="w-3 h-3 text-cyan-200" />
          <select value={model} onChange={(e) => { setModel(e.target.value); void setAiPreferences({ model: e.target.value }); }}
            className="bg-transparent text-[10px] text-white/85 outline-none max-w-[110px] appearance-none pr-1">
            {AI_MODELS.map((m) => (
              <option key={m.id} value={m.id} className="bg-black text-white">{m.label}</option>
            ))}
          </select>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X className="w-4 h-4" /></button>
      </header>
      <nav className="flex gap-1 px-3 pt-2.5 pb-2 text-[11px] border-b border-white/5 overflow-x-auto">
        {([
          { k: "rules",    i: <Bell    className="w-3.5 h-3.5" />, l: "Rules" },
          { k: "heatmaps", i: <Flame   className="w-3.5 h-3.5" />, l: "Heatmaps" },
          { k: "datasets", i: <Database className="w-3.5 h-3.5" />, l: "Datasets" },
          { k: "actions",  i: <Zap     className="w-3.5 h-3.5" />, l: "Actions" },
          { k: "insights", i: <Bot     className="w-3.5 h-3.5" />, l: "AI" },
        ] as { k: Tab; i: JSX.Element; l: string }[]).map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap border ${
              tab === t.k
                ? "bg-cyan-500/20 text-cyan-100 border-cyan-300/40 shadow-[0_0_12px_rgba(34,211,238,0.25)]"
                : "text-white/70 hover:bg-white/[0.06] border-transparent"
            }`}>
            {t.i}{t.l}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-auto p-3 text-[12px]">
        {tab === "rules" && (
          <RulesTab geofences={geofences} actions={actions} rules={rules}
            defaultGeofenceId={initialGeofenceId ?? null} datasets={datasets} onChange={refreshRules} model={model} />
        )}
        {tab === "heatmaps" && (
          <HeatmapsTab heatmaps={heatmaps} datasets={datasets} onChange={refreshHeatmaps} />
        )}
        {tab === "datasets" && (
          <DatasetsTab datasets={datasets} onChange={refreshDatasets} onHeatmapCreated={refreshHeatmaps} />
        )}
        {tab === "actions" && (
          <ActionsTab actions={actions} onChange={refreshActions} model={model} />
        )}
        {tab === "insights" && (
          <InsightsTab model={model} geofences={geofences} rules={rules} datasets={datasets} />
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════ RULES ═══════════════════════════════ */

const SOURCES: { k: SourceKind; l: string; hint: string; units: string }[] = [
  { k: "earthquake",   l: "Earthquake (USGS)",        hint: "Magnitude of quakes intersecting the geofence.", units: "magnitude" },
  { k: "storm",        l: "Storm / cyclone (NOAA)",   hint: "Storm intensity within the geofence.",           units: "category" },
  { k: "lightning",    l: "Lightning strikes",        hint: "Strikes per minute in the geofence.",            units: "strikes/min" },
  { k: "earth_layer",  l: "Earth Intelligence layer", hint: "Pixel value of an active Earth Intel raster.",   units: "value" },
  { k: "dataset",      l: "My uploaded dataset",      hint: "A numeric field on your uploaded dataset.",      units: "value" },
  { k: "osm_building", l: "OSM building",             hint: "Matching OSM buildings inside the geofence.",    units: "buildings" },
];

const CONDS: { k: Condition; l: string; help: string }[] = [
  { k: "gt",      l: "greater than",     help: "Fire when the measured value goes above the threshold." },
  { k: "lt",      l: "less than",        help: "Fire when the measured value drops below the threshold." },
  { k: "between", l: "between",          help: "Fire while the measured value stays inside a range." },
  { k: "enters",  l: "enters geofence",  help: "Fire when a moving feature crosses into the geofence." },
  { k: "exits",   l: "exits geofence",   help: "Fire when a moving feature crosses out of the geofence." },
  { k: "roc",     l: "rate of change",   help: "Fire when the value climbs or falls by X per minute." },
];

const SEVERITIES = [
  { k: "info",     label: "Info",     color: "#60a5fa" },
  { k: "warning",  label: "Warning",  color: "#fbbf24" },
  { k: "critical", label: "Critical", color: "#ef4444" },
] as const;

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface RuleDraft {
  name: string;
  geofenceIds: string[];
  sourceKind: SourceKind;
  datasetId: string;
  earthLayerId: string;
  osmTags: string;
  condition: Condition;
  value: string;
  valueMax: string;
  rocPerMin: string;
  cooldown: number;
  severity: "info" | "warning" | "critical";
  schedule: { days: number[]; startHour: number; endHour: number; allHours: boolean };
  aiHelper: boolean;
  firehose: boolean;
  actionIds: string[];
}

const EMPTY_DRAFT: RuleDraft = {
  name: "", geofenceIds: [], sourceKind: "earthquake", datasetId: "", earthLayerId: "", osmTags: "",
  condition: "gt", value: "", valueMax: "", rocPerMin: "",
  cooldown: 300, severity: "warning",
  schedule: { days: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 24, allHours: true },
  aiHelper: false, firehose: false, actionIds: [],
};

function RulesTab({ geofences, actions, rules, defaultGeofenceId, datasets, onChange, model }: {
  geofences: Geofence[]; actions: TileAction[]; rules: Rule[];
  defaultGeofenceId: string | null; datasets: UserDataset[]; onChange: () => Promise<void>; model: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(rules.length === 0);
  const [draft, setDraft] = useState<RuleDraft>(() => ({
    ...EMPTY_DRAFT,
    geofenceIds: defaultGeofenceId ? [defaultGeofenceId] : [],
  }));

  useEffect(() => {
    if (defaultGeofenceId) {
      setDraft((d) => ({ ...d, geofenceIds: [defaultGeofenceId] }));
      setShowBuilder(true);
    }
  }, [defaultGeofenceId]);

  const reset = () => { setDraft(EMPTY_DRAFT); setEditingId(null); };

  const startEdit = (r: Rule) => {
    const t = (r.threshold ?? {}) as any;
    setEditingId(r.id);
    setShowBuilder(true);
    setDraft({
      name: r.name,
      geofenceIds: r.geofence_id ? [r.geofence_id] : [],
      sourceKind: r.source_kind,
      datasetId: (r.source_ref as any)?.dataset_id ?? "",
      earthLayerId: (r.source_ref as any)?.layer_id ?? "",
      osmTags: (r.source_ref as any)?.tags ?? "",
      condition: r.condition,
      value: String(t.value ?? ""),
      valueMax: String(t.max ?? ""),
      rocPerMin: String(t.rocPerMin ?? ""),
      cooldown: r.cooldown_s,
      severity: (t.severity as any) ?? "warning",
      schedule: t.schedule ?? EMPTY_DRAFT.schedule,
      aiHelper: r.ai_assist,
      firehose: r.firehose,
      actionIds: [],
    });
  };

  const submit = async () => {
    if (!draft.name.trim()) return toast.error("Give the rule a name");
    if (draft.geofenceIds.length === 0) return toast.error("Pick at least one geofence");
    const threshold: Record<string, unknown> = {
      severity: draft.severity, schedule: draft.schedule,
    };
    if (draft.condition === "between") { threshold.value = Number(draft.value); threshold.max = Number(draft.valueMax); }
    else if (draft.condition === "roc") { threshold.rocPerMin = Number(draft.rocPerMin); }
    else if (draft.condition === "gt" || draft.condition === "lt") { threshold.value = Number(draft.value); }

    const source_ref: Record<string, unknown> = {};
    if (draft.sourceKind === "dataset")     source_ref.dataset_id = draft.datasetId;
    if (draft.sourceKind === "earth_layer") source_ref.layer_id = draft.earthLayerId;
    if (draft.sourceKind === "osm_building") source_ref.tags = draft.osmTags;

    for (const gid of draft.geofenceIds) {
      const rule = await createRule({
        geofence_id: gid,
        name: draft.geofenceIds.length > 1 ? `${draft.name} · ${geofences.find((g) => g.id === gid)?.name ?? ""}` : draft.name,
        source_kind: draft.sourceKind, source_ref,
        condition: draft.condition, threshold,
        cooldown_s: draft.cooldown, ai_assist: draft.aiHelper, ai_model: null,
        firehose: draft.firehose, enabled: true,
      });
      if (!rule) return toast.error("Sign in to save rules");
      if (draft.actionIds.length) await setRuleActions(rule.id, draft.actionIds);
      const plan = await runPipeline("rule", rule as unknown as Record<string, unknown>, { ai: draft.aiHelper, model });
      if (plan) {
        toast.success(`Pipeline · ${plan.steps.length} steps`, {
          description: plan.ai ?? plan.steps.map((s) => s.label).join(" → "),
          duration: 6000,
        });
      }
    }
    reset(); setShowBuilder(false);
    await onChange();
  };

  return (
    <div className="space-y-3">
      {rules.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <div className="text-[10px] uppercase tracking-widest text-white/40">Active rules · {rules.length}</div>
            {!showBuilder && (
              <button onClick={() => { reset(); setShowBuilder(true); }} className={btnPrimary}>
                <Plus className="w-3 h-3 inline -mt-0.5 mr-1" /> New rule
              </button>
            )}
          </div>
          {rules.map((r) => {
            const t = (r.threshold as any) ?? {};
            const sev = SEVERITIES.find((s) => s.k === t.severity) ?? SEVERITIES[1];
            const gf = geofences.find((g) => g.id === r.geofence_id);
            return (
              <div key={r.id} className={`${glass} p-2.5 flex items-start gap-2`}>
                <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: r.enabled ? sev.color : "#ffffff30" }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <div className="truncate font-medium text-[12px]">{r.name}</div>
                    <span className="text-[9px] px-1.5 py-[1px] rounded uppercase tracking-wider"
                      style={{ background: `${sev.color}22`, color: sev.color, border: `1px solid ${sev.color}55` }}>
                      {sev.label}
                    </span>
                  </div>
                  <div className="text-[10px] text-white/55 mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                    <span>{gf?.name ?? "no geofence"}</span>
                    <span>· {SOURCES.find((s) => s.k === r.source_kind)?.l ?? r.source_kind}</span>
                    <span>· {CONDS.find((c) => c.k === r.condition)?.l ?? r.condition} {t.value ?? ""}{t.max ? `..${t.max}` : ""}{t.rocPerMin ? ` (${t.rocPerMin}/min)` : ""}</span>
                    {r.ai_assist && <span className="text-cyan-300">· AI helper</span>}
                    {r.firehose && <span className="text-fuchsia-300">· firehose</span>}
                  </div>
                </div>
                <button onClick={async () => { await updateRule(r.id, { enabled: !r.enabled } as any); await onChange(); }}
                  className={`p-1.5 rounded ${r.enabled ? "bg-emerald-500/20 text-emerald-200" : "bg-white/5 text-white/50"}`}
                  title={r.enabled ? "Pause" : "Resume"}>
                  {r.enabled ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                </button>
                <button onClick={() => startEdit(r)} className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-white/70" title="Edit">✎</button>
                <button onClick={async () => { await deleteRule(r.id); await onChange(); }} className="p-1.5 rounded hover:bg-red-500/20 text-red-300" title="Delete">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!showBuilder && rules.length === 0 && (
        <button onClick={() => { reset(); setShowBuilder(true); }}
          className="w-full py-3 rounded-xl border border-dashed border-cyan-300/40 bg-cyan-500/5 hover:bg-cyan-500/10 text-cyan-200 text-[11px] flex items-center justify-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Create your first rule
        </button>
      )}

      {showBuilder && (
        <RuleBuilder draft={draft} setDraft={setDraft}
          geofences={geofences} datasets={datasets} actions={actions}
          editing={!!editingId}
          onCancel={() => { setShowBuilder(false); reset(); }}
          onSubmit={submit} />
      )}
    </div>
  );
}

function RuleBuilder({ draft, setDraft, geofences, datasets, actions, editing, onCancel, onSubmit }: {
  draft: RuleDraft; setDraft: (d: RuleDraft | ((prev: RuleDraft) => RuleDraft)) => void;
  geofences: Geofence[]; datasets: UserDataset[]; actions: TileAction[];
  editing: boolean; onCancel: () => void; onSubmit: () => void;
}) {
  const src = SOURCES.find((s) => s.k === draft.sourceKind)!;
  const cond = CONDS.find((c) => c.k === draft.condition)!;
  const patch = (p: Partial<RuleDraft>) => setDraft((d) => ({ ...d, ...p }));

  return (
    <div className={`${glass} p-3 space-y-3`} style={{ borderColor: "rgba(34,211,238,0.25)" }}>
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-3.5 h-3.5 text-cyan-300" />
        <div className="text-[11px] font-semibold tracking-wide uppercase text-cyan-100 flex-1">
          {editing ? "Edit rule" : "New alarm rule"}
        </div>
      </div>

      <Section n={1} title="Name">
        <input value={draft.name} onChange={(e) => patch({ name: e.target.value })}
          placeholder="e.g. Warehouse quake alert"
          className="w-full bg-black/40 rounded-md px-2.5 py-1.5 border border-white/10 focus:border-cyan-300/50 outline-none text-[12px]" />
      </Section>

      <Section n={2} title="Where — geofences to watch" hint="Rule fires only for events inside these geofences.">
        {geofences.length === 0 ? (
          <div className="text-[10px] text-white/50 italic">Draw a geofence first (right-click the map → “Make Intelligent”).</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {geofences.map((g) => {
              const on = draft.geofenceIds.includes(g.id);
              return (
                <button key={g.id}
                  onClick={() => patch({ geofenceIds: on ? draft.geofenceIds.filter((x) => x !== g.id) : [...draft.geofenceIds, g.id] })}
                  className={`text-[10.5px] px-2 py-1 rounded-md border transition-colors ${
                    on ? "bg-cyan-500/25 border-cyan-300/50 text-cyan-100" : "bg-white/5 border-white/10 hover:bg-white/10 text-white/70"
                  }`}>
                  <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ background: g.color }} />
                  {g.name}
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <Section n={3} title="What — data source" hint={src.hint}>
        <div className="grid grid-cols-2 gap-1.5">
          {SOURCES.map((s) => (
            <button key={s.k} onClick={() => patch({ sourceKind: s.k })}
              className={`text-[10.5px] text-left px-2 py-1.5 rounded-md border transition-colors ${
                draft.sourceKind === s.k ? "bg-cyan-500/20 border-cyan-300/50 text-cyan-100" : "bg-white/5 border-white/10 hover:bg-white/10 text-white/80"
              }`}>
              {s.l}
            </button>
          ))}
        </div>
        {draft.sourceKind === "dataset" && (
          <select value={draft.datasetId} onChange={(e) => patch({ datasetId: e.target.value })}
            className="mt-1.5 w-full bg-black/40 rounded-md px-2 py-1.5 border border-white/10 text-[11px]">
            <option value="">— pick a dataset —</option>
            {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        {draft.sourceKind === "earth_layer" && (
          <input value={draft.earthLayerId} onChange={(e) => patch({ earthLayerId: e.target.value })}
            placeholder="Earth Intel layer id (e.g. modis_terra_lst_day)"
            className="mt-1.5 w-full bg-black/40 rounded-md px-2 py-1.5 border border-white/10 text-[11px]" />
        )}
        {draft.sourceKind === "osm_building" && (
          <input value={draft.osmTags} onChange={(e) => patch({ osmTags: e.target.value })}
            placeholder='OSM tag filter e.g. amenity=hospital'
            className="mt-1.5 w-full bg-black/40 rounded-md px-2 py-1.5 border border-white/10 text-[11px]" />
        )}
      </Section>

      <Section n={4} title="When — condition" hint={cond.help}>
        <div className="grid grid-cols-3 gap-1.5">
          {CONDS.map((c) => (
            <button key={c.k} onClick={() => patch({ condition: c.k })}
              className={`text-[10.5px] px-2 py-1.5 rounded-md border transition-colors ${
                draft.condition === c.k ? "bg-cyan-500/20 border-cyan-300/50 text-cyan-100" : "bg-white/5 border-white/10 hover:bg-white/10 text-white/80"
              }`}>
              {c.l}
            </button>
          ))}
        </div>
        {(draft.condition === "gt" || draft.condition === "lt") && (
          <NumericInput label={`Threshold (${src.units})`} value={draft.value} onChange={(v) => patch({ value: v })} />
        )}
        {draft.condition === "between" && (
          <div className="flex gap-2 mt-1.5">
            <NumericInput label={`Min (${src.units})`} value={draft.value} onChange={(v) => patch({ value: v })} />
            <NumericInput label={`Max (${src.units})`} value={draft.valueMax} onChange={(v) => patch({ valueMax: v })} />
          </div>
        )}
        {draft.condition === "roc" && (
          <NumericInput label={`Change per minute (${src.units}/min)`} value={draft.rocPerMin} onChange={(v) => patch({ rocPerMin: v })} />
        )}
      </Section>

      <Section n={5} title="Schedule" hint="Only fire during these hours & days.">
        <div className="flex flex-wrap gap-1 mb-2">
          {DAY_LABELS.map((d, i) => {
            const on = draft.schedule.days.includes(i);
            return (
              <button key={d}
                onClick={() => patch({ schedule: { ...draft.schedule, days: on ? draft.schedule.days.filter((x) => x !== i) : [...draft.schedule.days, i] } })}
                className={`text-[10px] w-9 h-6 rounded-md border transition-colors ${
                  on ? "bg-cyan-500/25 border-cyan-300/50 text-cyan-100" : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                }`}>
                {d}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-1.5 text-[10.5px] text-white/70 mb-1.5">
          <input type="checkbox" checked={draft.schedule.allHours}
            onChange={(e) => patch({ schedule: { ...draft.schedule, allHours: e.target.checked } })} />
          24 hours a day
        </label>
        {!draft.schedule.allHours && (
          <div className="flex items-center gap-2 text-[10.5px] text-white/70">
            <Clock className="w-3 h-3" />
            <input type="number" min={0} max={23} value={draft.schedule.startHour}
              onChange={(e) => patch({ schedule: { ...draft.schedule, startHour: Number(e.target.value) } })}
              className="w-14 bg-black/40 rounded px-1.5 py-0.5 border border-white/10" />
            <span>to</span>
            <input type="number" min={1} max={24} value={draft.schedule.endHour}
              onChange={(e) => patch({ schedule: { ...draft.schedule, endHour: Number(e.target.value) } })}
              className="w-14 bg-black/40 rounded px-1.5 py-0.5 border border-white/10" />
            <span className="text-white/40">local time</span>
          </div>
        )}
      </Section>

      <Section n={6} title="Severity & frequency">
        <div className="flex items-center gap-1.5 mb-2">
          {SEVERITIES.map((s) => (
            <button key={s.k} onClick={() => patch({ severity: s.k })}
              className={`flex-1 text-[10.5px] py-1.5 rounded-md border transition-colors ${
                draft.severity === s.k ? "text-white" : "border-white/10 text-white/60 hover:bg-white/5"
              }`}
              style={draft.severity === s.k ? { background: `${s.color}30`, borderColor: `${s.color}88` } : {}}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[10.5px] text-white/70">
          <span>Cooldown</span>
          <input type="number" value={draft.cooldown}
            onChange={(e) => patch({ cooldown: Number(e.target.value) })}
            className="w-20 bg-black/40 rounded px-1.5 py-0.5 border border-white/10" />
          <span className="text-white/40">seconds between fires — 0 to disable</span>
        </div>
        <label className="flex items-start gap-2 mt-2 text-[10.5px] text-white/75 cursor-pointer">
          <input type="checkbox" checked={draft.firehose}
            onChange={(e) => patch({ firehose: e.target.checked })} className="mt-0.5" />
          <div>
            <div className="font-medium">Firehose mode</div>
            <div className="text-white/45 text-[10px]">Fire an event for <em>every</em> match instead of one per cooldown window. Use for streaming pipelines that need every hit.</div>
          </div>
        </label>
        <label className="flex items-start gap-2 mt-1.5 text-[10.5px] text-white/75 cursor-pointer">
          <input type="checkbox" checked={draft.aiHelper}
            onChange={(e) => patch({ aiHelper: e.target.checked })} className="mt-0.5" />
          <div>
            <div className="font-medium flex items-center gap-1"><Bot className="w-3 h-3 text-cyan-300" /> AI helper on each fire</div>
            <div className="text-white/45 text-[10px]">Runs the AI once per event to add a plain-English explanation (“what happened, why it matters, next step”). Small extra cost per fire.</div>
          </div>
        </label>
      </Section>

      <Section n={7} title="Actions to run when this fires">
        {actions.length === 0 ? (
          <div className="text-[10px] text-white/50 italic">Add actions in the <b>Actions</b> tab to send webhooks, email or SMS.</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {actions.map((a) => {
              const on = draft.actionIds.includes(a.id);
              return (
                <button key={a.id}
                  onClick={() => patch({ actionIds: on ? draft.actionIds.filter((x) => x !== a.id) : [...draft.actionIds, a.id] })}
                  className={`text-[10.5px] px-2 py-1 rounded-md border transition-colors ${
                    on ? "bg-emerald-500/20 border-emerald-300/40 text-emerald-100" : "bg-white/5 border-white/10 hover:bg-white/10 text-white/75"
                  }`}>
                  <span className="uppercase text-[9px] tracking-widest text-white/50 mr-1">{a.kind}</span>{a.name}
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <div className="flex gap-2 pt-1">
        <button onClick={onSubmit} className={`${btnPrimary} flex-1`}>{editing ? "Save changes" : "Create rule"}</button>
        <button onClick={onCancel} className={btnGhost}>Cancel</button>
      </div>
    </div>
  );
}

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-4 h-4 rounded-full bg-cyan-500/20 border border-cyan-300/40 flex items-center justify-center text-[9px] text-cyan-200 font-bold">{n}</span>
        <div className="text-[11px] font-medium">{title}</div>
        {hint && <Info aria-label={hint} className="w-3 h-3 text-white/40" />}
      </div>
      <div className="pl-5">{children}</div>
    </div>
  );
}

function NumericInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex-1 flex flex-col gap-0.5 mt-1.5">
      <span className="text-[9.5px] text-white/50 uppercase tracking-widest">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-black/40 rounded-md px-2 py-1.5 border border-white/10 focus:border-cyan-300/50 outline-none text-[12px]" />
    </label>
  );
}

/* ═══════════════════════════════ HEATMAPS ═══════════════════════════════ */

const CATEGORY_LABEL: Record<HeatCategory, string> = {
  hazards: "Hazards", weather: "Weather", environment: "Environment",
  transport: "Transport", human: "Human", space: "Space",
};
const CATEGORY_COLOR: Record<HeatCategory, string> = {
  hazards: "#ef4444", weather: "#60a5fa", environment: "#22c55e",
  transport: "#a78bfa", human: "#fbbf24", space: "#e0f2fe",
};

function HeatmapsTab({ heatmaps, datasets, onChange }: {
  heatmaps: HeatmapConfig[]; datasets: UserDataset[]; onChange: () => void;
}) {
  const [category, setCategory] = useState<HeatCategory | "all">("all");
  const [query, setQuery] = useState("");
  const activeIds = new Set(heatmaps.filter((h) => h.enabled).map((h) =>
    h.source.kind === "live" ? h.source.sourceId : `ds:${h.source.datasetId}`
  ));

  const filtered = useMemo(() => LIVE_GIS_SOURCES.filter((s) =>
    (category === "all" || s.category === category) &&
    (query.trim() === "" ||
      s.label.toLowerCase().includes(query.toLowerCase()) ||
      s.description.toLowerCase().includes(query.toLowerCase()))
  ), [category, query]);

  const toggleLive = (src: typeof LIVE_GIS_SOURCES[number]) => {
    const existing = heatmaps.find((h) => h.source.kind === "live" && h.source.sourceId === src.id);
    if (existing) {
      if (existing.enabled) { deleteHeatmap(existing.id); toast.success(`Removed ${src.label}`); }
      else { toggleHeatmap(existing.id, true); toast.success(`${src.label} on`); }
    } else {
      upsertHeatmap(newHeatmap({
        name: src.label,
        source: { kind: "live", sourceId: src.id },
        ramp: src.ramp, radius: src.radius,
      }));
      toast.success(`${src.label} added — rendering…`);
    }
    onChange();
  };

  return (
    <div className="space-y-3">
      {heatmaps.length > 0 && (
        <div className={`${glass} p-2.5`}>
          <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5 flex items-center gap-1.5">
            <Layers className="w-3 h-3" /> Active heatmaps · {heatmaps.length}
          </div>
          <div className="space-y-1.5">
            {heatmaps.map((h) => <HeatmapRow key={h.id} h={h} onChange={onChange} />)}
          </div>
        </div>
      )}

      {datasets.length > 0 && (
        <div className={`${glass} p-2.5`}>
          <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5">From your datasets</div>
          <div className="flex flex-wrap gap-1.5">
            {datasets.map((d) => (
              <button key={d.id}
                onClick={() => {
                  upsertHeatmap(newHeatmap({ name: `${d.name} (heatmap)`, source: { kind: "dataset", datasetId: d.id } }));
                  toast.success(`Heatmap created from ${d.name}`);
                  onChange();
                }}
                className="text-[10.5px] px-2 py-1 rounded-md bg-white/5 hover:bg-cyan-500/20 hover:text-cyan-100 text-white/75 border border-white/10 transition-colors">
                <Flame className="inline w-3 h-3 -mt-0.5 mr-1 text-orange-300" />{d.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className={`flex-1 flex items-center gap-1.5 ${glass} px-2 py-1`}>
            <Search className="w-3 h-3 text-white/40" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search live GIS feeds…"
              className="flex-1 bg-transparent outline-none text-[11px] placeholder:text-white/30" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1 mb-2">
          {(["all", "hazards", "weather", "environment", "transport", "human", "space"] as const).map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                category === c ? "bg-cyan-500/25 border-cyan-300/50 text-cyan-100" : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
              }`}>
              {c === "all" ? "All" : CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((src) => {
            const on = activeIds.has(src.id);
            const color = CATEGORY_COLOR[src.category];
            const ramp = HEAT_RAMPS.find((r) => r.id === src.ramp) ?? HEAT_RAMPS[0];
            return (
              <button key={src.id} onClick={() => toggleLive(src)}
                className={`text-left rounded-xl overflow-hidden border transition-all group ${
                  on ? "border-cyan-300/80 shadow-[0_0_14px_rgba(34,211,238,0.35)] bg-cyan-500/10"
                     : "border-white/10 hover:border-white/30 bg-white/[0.03]"
                }`}>
                <div className="relative h-14 overflow-hidden"
                  style={{ background: `linear-gradient(90deg, ${sampleRamp(ramp, 0)} 0%, ${sampleRamp(ramp, 0.5)} 50%, ${sampleRamp(ramp, 1)} 100%)` }}>
                  <div className="absolute inset-0 opacity-40 mix-blend-overlay" style={{
                    backgroundImage:
                      "radial-gradient(circle at 20% 40%, rgba(255,255,255,0.6) 0, transparent 40%), " +
                      "radial-gradient(circle at 70% 60%, rgba(255,255,255,0.5) 0, transparent 40%), " +
                      "radial-gradient(circle at 45% 80%, rgba(255,255,255,0.4) 0, transparent 35%)",
                  }} />
                  <div className="absolute top-1 left-1 px-1.5 py-[1px] rounded text-[9px] font-semibold uppercase tracking-wider"
                    style={{ background: `${color}44`, color, border: `1px solid ${color}88` }}>
                    {CATEGORY_LABEL[src.category]}
                  </div>
                  {on && (
                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-cyan-400 text-black flex items-center justify-center">
                      <Check className="w-3 h-3" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <div className="px-2 py-1.5">
                  <div className="text-[11px] font-medium leading-tight line-clamp-1">{src.label}</div>
                  <div className="text-[9px] text-white/50 mt-0.5 line-clamp-2">{src.description}</div>
                  <div className="text-[9px] text-white/40 mt-1">{src.provider} · refresh {Math.max(1, Math.round(src.refreshMs / 60000))}m</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HeatmapRow({ h, onChange }: { h: HeatmapConfig; onChange: () => void }) {
  const ramp = HEAT_RAMPS.find((r) => r.id === h.ramp) ?? HEAT_RAMPS[0];
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-black/30 border border-white/5">
      <div className="w-6 h-6 rounded shrink-0"
        style={{ background: `linear-gradient(90deg, ${sampleRamp(ramp, 0)}, ${sampleRamp(ramp, 0.5)}, ${sampleRamp(ramp, 1)})` }} />
      <div className="flex-1 min-w-0">
        <div className="truncate text-[11px] font-medium">{h.name}</div>
        <div className="text-[9.5px] text-white/45">{h.source.kind === "live" ? "Live feed" : "Dataset"} · {ramp.label} · r{h.radius}</div>
      </div>
      <select value={h.ramp} onChange={(e) => { upsertHeatmap({ ...h, ramp: e.target.value }); onChange(); }}
        className="bg-black/40 rounded px-1 py-0.5 border border-white/10 text-[10px]">
        {HEAT_RAMPS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
      </select>
      <input type="range" min={4} max={80} value={h.radius}
        onChange={(e) => { upsertHeatmap({ ...h, radius: Number(e.target.value) }); onChange(); }}
        className="w-14 accent-cyan-400" title="Radius" />
      <button onClick={() => { toggleHeatmap(h.id); onChange(); }}
        className={`p-1 rounded ${h.enabled ? "bg-emerald-500/25 text-emerald-200" : "bg-white/5 text-white/50"}`}>
        {h.enabled ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
      </button>
      <button onClick={() => { deleteHeatmap(h.id); onChange(); }} className="p-1 rounded hover:bg-red-500/20 text-red-300">
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

/* ═══════════════════════════════ ACTIONS ═══════════════════════════════ */

const ACTION_KINDS: { k: ActionKind; label: string; icon: JSX.Element; hint: string; fields: { key: string; placeholder: string; label: string }[] }[] = [
  { k: "in_app",   label: "In-app alert", icon: <Bell className="w-3.5 h-3.5" />,  hint: "Ping the bell in your Atlas toolbar in real time.", fields: [] },
  { k: "webhook",  label: "Webhook",      icon: <Radio className="w-3.5 h-3.5" />, hint: "POST the event JSON to any HTTPS URL. Signed with a shared secret.", fields: [{ key: "url", label: "URL", placeholder: "https://your.server/hook" }] },
  { k: "email",    label: "Email",        icon: <Send className="w-3.5 h-3.5" />,  hint: "Send an email through Lovable Cloud transactional mail.", fields: [{ key: "to", label: "Recipient", placeholder: "you@example.com" }] },
  { k: "sms",      label: "SMS",          icon: <Zap className="w-3.5 h-3.5" />,   hint: "Send an SMS via GatewayAPI (needs GATEWAYAPI_TOKEN secret).", fields: [{ key: "recipient", label: "Number (E.164)", placeholder: "+14155551234" }] },
  { k: "pipeline", label: "Pipeline",     icon: <Waves className="w-3.5 h-3.5" />, hint: "Push into an internal pipeline queue (name it however you like).", fields: [{ key: "queue", label: "Queue name", placeholder: "my-queue" }] },
];

function ActionsTab({ actions, onChange, model }: { actions: TileAction[]; onChange: () => Promise<void>; model: string }) {
  const [kind, setKind] = useState<ActionKind>("in_app");
  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});

  const def = ACTION_KINDS.find((k) => k.k === kind)!;
  const add = async () => {
    if (!name) return toast.error("Give the action a name");
    const config: Record<string, unknown> = { ...values };
    const secret = kind === "webhook" ? crypto.randomUUID() : null;
    const created = await createAction({ name, kind, config, enabled: true, secret });
    if (!created) return toast.error("Sign in to create actions");
    setName(""); setValues({});
    await onChange();
    const plan = await runPipeline("action", created as unknown as Record<string, unknown>, { ai: true, model });
    toast.success(plan ? `Pipeline · ${plan.steps.length} steps` : "Action added", {
      description: plan?.ai ?? plan?.steps.map((s) => s.label).join(" → "),
      duration: 6000,
    });
  };

  return (
    <div className="space-y-3">
      {actions.length > 0 && (
        <div className="space-y-1.5">
          {actions.map((a) => {
            const meta = ACTION_KINDS.find((k) => k.k === a.kind);
            return (
              <div key={a.id} className={`${glass} p-2.5 flex items-center gap-2`}>
                <div className="w-7 h-7 rounded-md bg-cyan-500/15 border border-cyan-300/30 flex items-center justify-center text-cyan-200">
                  {meta?.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-[12px] font-medium">{a.name}</div>
                  <div className="text-[10px] text-white/50 truncate">{meta?.label ?? a.kind} · {Object.values(a.config).join(" · ")}</div>
                </div>
                <button onClick={async () => { await deleteAction(a.id); await onChange(); }}
                  className="p-1.5 rounded hover:bg-red-500/20 text-red-300">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className={`${glass} p-3 space-y-2`} style={{ borderColor: "rgba(34,211,238,0.25)" }}>
        <div className="text-[11px] uppercase tracking-widest text-cyan-100/80 font-semibold">Add action</div>
        <div className="grid grid-cols-5 gap-1.5">
          {ACTION_KINDS.map((k) => (
            <button key={k.k} onClick={() => { setKind(k.k); setValues({}); }}
              className={`text-[10px] p-2 rounded-md border flex flex-col items-center gap-1 transition-colors ${
                kind === k.k ? "bg-cyan-500/20 border-cyan-300/50 text-cyan-100" : "bg-white/5 border-white/10 hover:bg-white/10 text-white/70"
              }`}>
              {k.icon}
              <span>{k.label}</span>
            </button>
          ))}
        </div>
        <div className="text-[10px] text-white/50">{def.hint}</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Action name"
          className="w-full bg-black/40 rounded-md px-2 py-1.5 border border-white/10 text-[11px]" />
        {def.fields.map((f) => (
          <input key={f.key} value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            placeholder={f.placeholder}
            className="w-full bg-black/40 rounded-md px-2 py-1.5 border border-white/10 text-[11px]" />
        ))}
        <button onClick={add} className={`${btnPrimary} w-full flex items-center justify-center gap-1`}>
          <Plus className="w-3 h-3" /> Add action
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════ DATASETS ═══════════════════════════════ */

function DatasetsTab({ datasets, onChange, onHeatmapCreated }: {
  datasets: UserDataset[]; onChange: () => Promise<void>; onHeatmapCreated: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const ingestBase = useMemo(() =>
    `${(import.meta as any).env?.VITE_SUPABASE_URL || ""}/functions/v1/tile-intel-ingest`, []);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    try { await uploadDataset(file); toast.success("Uploaded — parsing in the background"); await onChange(); }
    catch (err) { toast.error(String((err as any)?.message ?? err)); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  return (
    <div className="space-y-3">
      <div className={`${glass} p-3`}>
        <div className="text-[11px] font-semibold text-white mb-1">Upload dataset</div>
        <div className="text-[10px] text-white/55 mb-2">
          GeoJSON, KML/KMZ, Shapefile .zip, CSV (lat/lon), GeoTIFF, NetCDF, GPX, JSON, or model files.
        </div>
        <input ref={inputRef} type="file" onChange={onFile} disabled={busy}
          accept=".geojson,.json,.kml,.kmz,.zip,.csv,.tsv,.tif,.tiff,.nc,.gpx,.onnx,.pt,.pkl,.joblib,.pb,.h5"
          className="text-[11px] w-full file:mr-2 file:rounded-md file:border-0 file:bg-cyan-500/25 file:text-cyan-100 file:px-3 file:py-1.5 file:text-[11px] file:cursor-pointer" />
      </div>
      {datasets.length === 0 && (
        <div className="text-[11px] text-white/50 text-center py-4">
          No datasets yet. Upload one above — or stream data in with the ingest URL after upload.
        </div>
      )}
      <div className="space-y-1.5">
        {datasets.map((d) => (
          <div key={d.id} className={`${glass} p-2.5 space-y-2`}>
            <div className="flex items-center gap-2">
              <span className="text-[9px] px-1.5 py-[1px] rounded bg-cyan-500/20 text-cyan-100 uppercase tracking-widest">{d.kind}</span>
              <div className="flex-1 min-w-0">
                <div className="truncate text-[12px] font-medium">{d.name}</div>
                <div className="text-[10px] text-white/50">{d.sample_count} points · {d.bbox ? "geo-parsed" : "not yet parsed"}</div>
              </div>
              <button title="Create heatmap"
                onClick={() => {
                  upsertHeatmap(newHeatmap({ name: `${d.name} (heatmap)`, source: { kind: "dataset", datasetId: d.id } }));
                  toast.success("Heatmap created");
                  onHeatmapCreated();
                }}
                className="p-1.5 rounded bg-orange-500/20 hover:bg-orange-500/35 text-orange-100">
                <Flame className="w-3 h-3" />
              </button>
              <button onClick={async () => { await deleteDataset(d); await onChange(); }} className="p-1.5 rounded hover:bg-red-500/20 text-red-300">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-white/60 bg-black/40 rounded px-2 py-1">
              <Radio className="w-3 h-3 text-cyan-300" />
              <code className="truncate flex-1 text-white/70">{ingestBase}?token={d.ingest_token.slice(0, 8)}…</code>
              <button onClick={() => { navigator.clipboard.writeText(`${ingestBase}?token=${d.ingest_token}`); toast.success("Ingest URL copied"); }}
                className="p-1 rounded hover:bg-white/10"><Copy className="w-3 h-3" /></button>
              <button onClick={async () => { await rotateIngestToken(d.id); await onChange(); toast.success("Token rotated"); }}
                className="p-1 rounded hover:bg-white/10"><KeyRound className="w-3 h-3" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════ INSIGHTS ═══════════════════════════════ */

function InsightsTab({ model, geofences, rules, datasets }: {
  model: string;
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
          context: {
            geofences: geofences.map((g) => ({ id: g.id, name: g.name, tiles: g.tile_set.length })),
            rules: rules.map((r) => ({ id: r.id, name: r.name, source_kind: r.source_kind, condition: r.condition, threshold: r.threshold })),
            datasets: datasets.map((d) => ({ id: d.id, name: d.name, kind: d.kind, count: d.sample_count })),
          },
        }),
      });
      if (!r.ok || !r.body) { toast.error(`AI error ${r.status}`); return; }
      const reader = r.body.getReader(); const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n"); buf = parts.pop() ?? "";
        for (const line of parts) {
          const s = line.trim(); if (!s.startsWith("data:")) continue;
          const payload = s.slice(5).trim(); if (payload === "[DONE]") continue;
          try { const j = JSON.parse(payload); const delta = j.choices?.[0]?.delta?.content; if (delta) setAnswer((a) => a + delta); }
          catch { /* noop */ }
        }
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className={`${glass} p-2.5 flex items-start gap-2 text-[10px] text-white/55 leading-snug`}>
        <Info className="w-3 h-3 mt-0.5 text-cyan-200 shrink-0" />
        <div>
          Model <span className="text-cyan-100 font-medium">{AI_MODELS.find((m) => m.id === model)?.label ?? model}</span> —
          switch it any time from the dropdown in the panel header. AI only runs when you Ask, Forecast, opt-in on a rule,
          or when the pipeline narrator is enabled on save.
        </div>
      </div>
      <div className={`${glass} p-3 space-y-2`}>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
          placeholder="Ask about your geofences, rules, datasets or heatmaps…"
          className="w-full bg-black/40 rounded-md px-2 py-1.5 border border-white/10 text-[11px] resize-none focus:border-cyan-300/50 outline-none" />
        <div className="flex gap-1.5">
          <button disabled={busy} onClick={() => ask("chat")} className={`${btnPrimary} flex-1 flex items-center justify-center gap-1`}>
            <Send className="w-3 h-3" /> Ask
          </button>
          <button disabled={busy} onClick={() => ask("forecast")}
            className="flex-1 py-1.5 rounded-md bg-fuchsia-500/25 hover:bg-fuchsia-500/40 disabled:opacity-40 text-fuchsia-100 text-[11px] flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3" /> Forecast 24h
          </button>
        </div>
        {answer && (
          <pre className="text-[11px] whitespace-pre-wrap text-white/85 max-h-64 overflow-auto rounded-md bg-black/50 p-2 border border-white/10">{answer}</pre>
        )}
      </div>
    </div>
  );
}