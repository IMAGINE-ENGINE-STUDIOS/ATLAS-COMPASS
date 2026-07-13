import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle, Flame, Waves, Wind, Mountain, Zap, Sun, Snowflake,
  Droplets, CloudRain, Tornado, ExternalLink, Siren, Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Broadcast = {
  id: string;
  agency: string;
  agency_handle: string;
  agency_verified: boolean;
  kind: "warning" | "news";
  title: string;
  body: string | null;
  hazard_type: string | null;
  severity: number | null;
  region: string | null;
  source_url: string;
  event_time: string;
  lat: number | null;
  lon: number | null;
};

type DisasterEvent = {
  id: string;
  hazard_type: string;
  severity: number | null;
  magnitude: number | null;
  title: string;
  summary: string | null;
  region: string | null;
  country: string | null;
  event_time: string;
  url: string | null;
};

type SosWarning = {
  id: string;
  title: string;
  body: string | null;
  hazard_type: string | null;
  severity: number | null;
  region: string | null;
  source_url: string | null;
  created_at: string;
};

const HAZARDS: { key: string; label: string; Icon: typeof Flame; match: RegExp }[] = [
  { key: "earthquake", label: "Earthquake", Icon: Activity,   match: /quake|seismic|earthquake/i },
  { key: "flood",      label: "Flood",      Icon: Waves,      match: /flood/i },
  { key: "wildfire",   label: "Wildfire",   Icon: Flame,      match: /fire|wildfire/i },
  { key: "hurricane",  label: "Hurricane",  Icon: Wind,       match: /hurricane|cyclone|typhoon|tropical/i },
  { key: "tornado",    label: "Tornado",    Icon: Tornado,    match: /tornado/i },
  { key: "storm",      label: "Storm",      Icon: CloudRain,  match: /storm|thunder/i },
  { key: "volcano",    label: "Volcano",    Icon: Mountain,   match: /volcan/i },
  { key: "heat",       label: "Heat",       Icon: Sun,        match: /heat|temp/i },
  { key: "cold",       label: "Cold",       Icon: Snowflake,  match: /cold|freeze|winter|snow/i },
  { key: "drought",    label: "Drought",    Icon: Droplets,   match: /drought/i },
  { key: "wind",       label: "Wind",       Icon: Zap,        match: /wind/i },
  { key: "other",      label: "Other",      Icon: AlertTriangle, match: /./ },
];

function classifyHazard(raw: string | null | undefined, title?: string): string {
  const s = `${raw ?? ""} ${title ?? ""}`;
  for (const h of HAZARDS) if (h.key !== "other" && h.match.test(s)) return h.key;
  return "other";
}

function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

function sevTone(sev: number | null): string {
  if (sev == null) return "text-muted-foreground";
  if (sev >= 5) return "text-destructive";
  if (sev >= 4) return "text-warning";
  if (sev >= 3) return "text-warning/80";
  return "text-muted-foreground";
}
function sevDot(sev: number | null): string {
  if (sev == null) return "bg-muted";
  if (sev >= 5) return "bg-destructive";
  if (sev >= 4) return "bg-warning";
  if (sev >= 3) return "bg-warning/70";
  return "bg-muted";
}

export function DisasterOpsSection() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [events, setEvents] = useState<DisasterEvent[]>([]);
  const [sosWarnings, setSosWarnings] = useState<SosWarning[]>([]);

  // Poll unified broadcasts every 5s (edge fn caches 10s).
  useEffect(() => {
    let cancelled = false;
    let inflight = false;
    async function tick() {
      if (inflight || document.hidden) return;
      inflight = true;
      try {
        const { data, error } = await supabase.functions.invoke("hot-news", { body: {} });
        if (cancelled || error || !data?.items) return;
        setBroadcasts(data.items as Broadcast[]);
      } catch { /* offline */ }
      finally { inflight = false; }
    }
    tick();
    const t = setInterval(tick, 5_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Load disaster_events + community sos warnings once, plus realtime.
  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [{ data: ev }, { data: sos }] = await Promise.all([
        supabase.from("disaster_events")
          .select("id,hazard_type,severity,magnitude,title,summary,region,country,event_time,url")
          .order("event_time", { ascending: false }).limit(60),
        supabase.from("sos_posts")
          .select("id,title,body,hazard_type,severity,region,source_url,created_at")
          .eq("kind", "warning").gte("created_at", since)
          .order("created_at", { ascending: false }).limit(30),
      ]);
      setEvents((ev ?? []) as DisasterEvent[]);
      setSosWarnings((sos ?? []) as SosWarning[]);
    })();

    const ch = supabase
      .channel("dashboard_disaster_rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "disaster_events" }, (p) => {
        setEvents((prev) => [p.new as DisasterEvent, ...prev].slice(0, 60));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sos_posts" }, (p) => {
        const row = p.new as SosWarning & { kind: string };
        if (row.kind === "warning") setSosWarnings((prev) => [row, ...prev].slice(0, 30));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Top warnings across broadcast + local SOS.
  const topWarnings = useMemo(() => {
    const bcast = broadcasts.filter((b) => b.kind === "warning").map((b) => ({
      key: b.id, title: b.title, agency: b.agency, severity: b.severity ?? 3,
      region: b.region, url: b.source_url, time: b.event_time,
      hazard: classifyHazard(b.hazard_type, b.title),
    }));
    const sos = sosWarnings.map((s) => ({
      key: `sos:${s.id}`, title: s.title, agency: "Community", severity: s.severity ?? 3,
      region: s.region, url: s.source_url ?? "", time: s.created_at,
      hazard: classifyHazard(s.hazard_type, s.title),
    }));
    return [...bcast, ...sos]
      .sort((a, b) => (b.severity - a.severity) || (+new Date(b.time) - +new Date(a.time)))
      .slice(0, 8);
  }, [broadcasts, sosWarnings]);

  const activeEmergencies = useMemo(() => {
    const since = Date.now() - 24 * 3600 * 1000;
    return events.filter((e) => (e.severity ?? 0) >= 4 && +new Date(e.event_time) >= since).slice(0, 6);
  }, [events]);

  const escalatingCount = useMemo(
    () => activeEmergencies.filter((e) => (e.severity ?? 0) >= 5).length,
    [activeEmergencies],
  );

  // Hazard indicator tallies over last 24h.
  const hazardCounts = useMemo(() => {
    const since = Date.now() - 24 * 3600 * 1000;
    const counts: Record<string, number> = {};
    for (const h of HAZARDS) counts[h.key] = 0;
    for (const b of broadcasts) {
      if (+new Date(b.event_time) < since) continue;
      counts[classifyHazard(b.hazard_type, b.title)]++;
    }
    for (const e of events) {
      if (+new Date(e.event_time) < since) continue;
      counts[classifyHazard(e.hazard_type, e.title)]++;
    }
    return counts;
  }, [broadcasts, events]);

  // Catastrophe ledger — merged newest-first.
  const ledger = useMemo(() => {
    const merged = [
      ...broadcasts.map((b) => ({
        id: b.id, time: b.event_time, agency: b.agency, kind: b.kind,
        title: b.title, region: b.region ?? "",
        hazard: classifyHazard(b.hazard_type, b.title),
        severity: b.severity, url: b.source_url,
      })),
      ...events.map((e) => ({
        id: `ev:${e.id}`, time: e.event_time, agency: "disaster_events", kind: "news" as const,
        title: e.title, region: e.region ?? e.country ?? "",
        hazard: classifyHazard(e.hazard_type, e.title),
        severity: e.severity, url: e.url ?? "",
      })),
    ];
    return merged
      .sort((a, b) => +new Date(b.time) - +new Date(a.time))
      .slice(0, 40);
  }, [broadcasts, events]);

  return (
    <div className="space-y-4">
      {/* Row: top warnings + active emergencies */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive">
                <Siren className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Top Warnings</h3>
                <p className="text-[11px] text-muted-foreground">Severity ranked across all sources</p>
              </div>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              {topWarnings.length} active
            </span>
          </div>
          <div className="space-y-1.5">
            {topWarnings.map((w, i) => {
              const Icon = (HAZARDS.find((h) => h.key === w.hazard) ?? HAZARDS[HAZARDS.length - 1]).Icon;
              return (
                <motion.a
                  key={w.key}
                  href={w.url || "#"}
                  target="_blank" rel="noreferrer"
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-border/40 hover:border-primary/30 hover:bg-muted/20 transition-all text-xs"
                >
                  <span className={`w-2 h-2 rounded-full ${sevDot(w.severity)} shrink-0`} />
                  <Icon className={`w-4 h-4 shrink-0 ${sevTone(w.severity)}`} />
                  <span className="flex-1 truncate font-medium text-foreground">{w.title}</span>
                  <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[120px]">{w.agency}</span>
                  <span className={`text-[10px] font-mono tabular-nums ${sevTone(w.severity)}`}>Sev {w.severity ?? "—"}</span>
                  <span className="text-[10px] font-mono tabular-nums text-muted-foreground w-8 text-right">{timeAgo(w.time)}</span>
                </motion.a>
              );
            })}
            {topWarnings.length === 0 && (
              <div className="text-xs text-muted-foreground py-6 text-center">
                No active warnings at this moment.
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center text-warning">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Active Emergencies</h3>
                <p className="text-[11px] text-muted-foreground">Severity ≥ 4 · last 24h</p>
              </div>
            </div>
          </div>
          <div className="flex items-baseline gap-3 mb-3">
            <span className="text-3xl font-mono font-bold text-foreground tabular-nums">
              {activeEmergencies.length}
            </span>
            <span className="text-[10px] font-mono text-destructive uppercase tracking-wider">
              {escalatingCount} escalating
            </span>
          </div>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {activeEmergencies.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-border/40 last:border-0">
                <span className={`w-1.5 h-1.5 rounded-full ${sevDot(e.severity)}`} />
                <span className="flex-1 truncate text-foreground">{e.title}</span>
                <span className="text-[10px] font-mono text-muted-foreground">{e.region ?? e.country ?? ""}</span>
              </div>
            ))}
            {activeEmergencies.length === 0 && (
              <p className="text-xs text-muted-foreground py-3">All quiet — no severe events in the last 24h.</p>
            )}
          </div>
        </div>
      </div>

      {/* Hazard indicators */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Hazard Indicators</h3>
            <p className="text-[11px] text-muted-foreground">Event count per category · last 24h</p>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            {Object.values(hazardCounts).reduce((a, b) => a + b, 0)} events
          </span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {HAZARDS.filter((h) => h.key !== "other" || hazardCounts.other > 0).map((h) => {
            const n = hazardCounts[h.key] ?? 0;
            const hot = n >= 10 ? "text-destructive" : n >= 3 ? "text-warning" : "text-muted-foreground";
            return (
              <div key={h.key} className="rounded-lg border border-border/50 p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted/40 flex items-center justify-center">
                  <h.Icon className={`w-4 h-4 ${hot}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{h.label}</p>
                  <p className={`text-lg font-mono font-bold tabular-nums ${n > 0 ? "text-foreground" : "text-muted-foreground/60"}`}>{n}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Catastrophe ledger */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Catastrophe Ledger</h3>
            <p className="text-[11px] text-muted-foreground">Merged broadcast + local event stream</p>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            {ledger.length} entries
          </span>
        </div>
        <div className="max-h-[360px] overflow-y-auto divide-y divide-border/40">
          {ledger.map((row) => {
            const Icon = (HAZARDS.find((h) => h.key === row.hazard) ?? HAZARDS[HAZARDS.length - 1]).Icon;
            return (
              <div key={row.id} className="grid grid-cols-12 items-center gap-2 py-2 text-xs">
                <span className="col-span-1 font-mono tabular-nums text-muted-foreground">{timeAgo(row.time)}</span>
                <div className="col-span-1 flex items-center">
                  <span className={`w-2 h-2 rounded-full ${sevDot(row.severity)}`} />
                </div>
                <div className="col-span-1 flex items-center">
                  <Icon className={`w-4 h-4 ${sevTone(row.severity)}`} />
                </div>
                <span className="col-span-5 truncate font-medium text-foreground">{row.title}</span>
                <span className="col-span-2 truncate text-[10px] font-mono text-muted-foreground">{row.agency}</span>
                <span className="col-span-1 truncate text-[10px] text-muted-foreground">{row.region}</span>
                <div className="col-span-1 text-right">
                  {row.url ? (
                    <a href={row.url} target="_blank" rel="noreferrer" className="inline-flex items-center text-muted-foreground hover:text-primary">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
          {ledger.length === 0 && (
            <p className="text-xs text-muted-foreground py-4">Ledger warming up…</p>
          )}
        </div>
      </div>
    </div>
  );
}