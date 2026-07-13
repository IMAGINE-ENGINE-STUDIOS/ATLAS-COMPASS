import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, XCircle, RadioTower } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type SourceHealth = {
  id: string;
  name: string;
  handle: string;
  url: string;
  status: "ok" | "delayed" | "down";
  latency_ms: number | null;
  http_status: number | null;
  item_count: number | null;
  last_success_iso: string | null;
  error: string | null;
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function statusMeta(s: SourceHealth["status"]) {
  if (s === "ok")      return { label: "OK",      dot: "bg-success",     text: "text-success",     Icon: CheckCircle2 };
  if (s === "delayed") return { label: "Delayed", dot: "bg-warning",     text: "text-warning",     Icon: AlertTriangle };
  return                       { label: "Down",   dot: "bg-destructive", text: "text-destructive", Icon: XCircle };
}

export function FeedHealthCard() {
  const [sources, setSources] = useState<SourceHealth[]>([]);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let inflight = false;
    async function tick() {
      if (inflight || document.hidden) return;
      inflight = true;
      try {
        const { data, error } = await supabase.functions.invoke("hot-status", { body: {} });
        if (cancelled) return;
        if (error) { setErr(error.message ?? "probe failed"); return; }
        setSources((data?.sources ?? []) as SourceHealth[]);
        setLoadedAt(data?.generated_at ?? new Date().toISOString());
        setErr(null);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally { inflight = false; }
    }
    tick();
    const t = setInterval(tick, 5_000);
    const onVis = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  const okCount = sources.filter((s) => s.status === "ok").length;
  const total = sources.length;
  const overall: "ok" | "delayed" | "down" =
    sources.some((s) => s.status === "down") ? "down" :
    sources.some((s) => s.status === "delayed") ? "delayed" : "ok";
  const overallMeta = statusMeta(overall);

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <RadioTower className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Feed Health</h3>
            <p className="text-[11px] text-muted-foreground">Live agency broadcast probes</p>
          </div>
        </div>
        <div className="text-right">
          <div className={`flex items-center gap-2 text-xs font-mono ${overallMeta.text}`}>
            <span className={`w-2 h-2 rounded-full ${overallMeta.dot} animate-pulse`} />
            <span className="tabular-nums">{okCount}/{total || 5}</span>
            <span className="uppercase tracking-wider">{overallMeta.label}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
            polled {timeAgo(loadedAt)}
          </p>
        </div>
      </div>

      {err && sources.length === 0 && (
        <p className="text-xs text-destructive font-mono">probe error: {err}</p>
      )}

      <div className="divide-y divide-border/50">
        {sources.map((s) => {
          const meta = statusMeta(s.status);
          return (
            <motion.div
              key={s.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-12 items-center gap-2 py-2.5 text-xs"
            >
              <div className="col-span-4 flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full ${meta.dot} shrink-0`} />
                <span className="font-semibold text-foreground truncate">{s.name}</span>
              </div>
              <div className={`col-span-2 font-mono tabular-nums ${meta.text}`}>
                {meta.label}
              </div>
              <div className="col-span-2 font-mono tabular-nums text-muted-foreground text-right">
                {s.latency_ms != null ? `${s.latency_ms}ms` : "—"}
              </div>
              <div className="col-span-2 font-mono tabular-nums text-muted-foreground text-right">
                {s.item_count != null ? `${s.item_count} items` : "—"}
              </div>
              <div className="col-span-2 font-mono tabular-nums text-muted-foreground text-right">
                {timeAgo(s.last_success_iso)}
              </div>
            </motion.div>
          );
        })}
        {sources.length === 0 && !err && (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 my-1 rounded bg-muted/30 animate-pulse" />
          ))
        )}
      </div>
    </div>
  );
}