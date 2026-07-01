import { useEffect, useState } from "react";
import { AlertTriangle, X, Sparkles, ShieldCheck, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ResourceRow = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  is_verified: boolean | null;
  is_emergency: boolean | null;
  confirmations_count: number | null;
  created_at: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

const DISASTER_TYPES = [
  "earthquake",
  "flood",
  "wildfire",
  "hurricane",
  "tornado",
  "power outage",
  "medical",
];

export default function EmergencyPanel({ open, onClose }: Props) {
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [disaster, setDisaster] = useState<string>("earthquake");
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tips, setTips] = useState<string>("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("resources")
      .select("id,title,description,category,tags,is_verified,is_emergency,confirmations_count,created_at")
      .eq("is_emergency", true)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) toast.error("Failed to load resources");
    else setResources((data as ResourceRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const askAI = async () => {
    setTipsLoading(true);
    setTips("");
    try {
      const { data, error } = await supabase.functions.invoke("emergency-ai-tips", {
        body: { disaster },
      });
      if (error) throw error;
      const text = (data as any)?.tips ?? (data as any)?.text ?? JSON.stringify(data);
      setTips(typeof text === "string" ? text : String(text));
    } catch (e: any) {
      toast.error("AI tips unavailable", { description: e?.message ?? String(e) });
    } finally {
      setTipsLoading(false);
    }
  };

  const confirm = async (id: string) => {
    const { data, error } = await supabase.rpc("confirm_emergency_resource", { _resource_id: id });
    if (error) return toast.error("Sign-in required to confirm");
    toast.success(`Confirmed (${data ?? 1})`);
    setResources((rs) => rs.map((r) => (r.id === id ? { ...r, confirmations_count: (data as number) ?? (r.confirmations_count ?? 0) + 1 } : r)));
  };

  if (!open) return null;

  return (
    <div className="absolute top-20 right-4 z-40 w-[calc(100vw-2rem)] max-w-80 animate-fade-in">
      <div className="p-3 rounded-xl border border-red-500/40 bg-red-950/40 backdrop-blur-xl shadow-[0_0_30px_rgba(239,68,68,0.35)]">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" />
          <span className="text-sm font-bold text-red-200 tracking-wide">EMERGENCY MODE</span>
          <button onClick={load} className="ml-auto text-red-200/70 hover:text-white" title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={onClose} className="text-red-200/70 hover:text-white" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* AI Tips */}
        <div className="mb-3 p-2 rounded-lg bg-black/40 border border-red-500/20">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span className="text-[11px] font-semibold text-amber-200 uppercase tracking-wider">Safety tips</span>
          </div>
          <div className="flex gap-1.5 mb-1.5">
            <select
              value={disaster}
              onChange={(e) => setDisaster(e.target.value)}
              className="flex-1 text-xs bg-black/60 border border-white/10 text-white rounded-md px-2 py-1 focus:outline-none focus:border-red-400"
            >
              {DISASTER_TYPES.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <button
              onClick={askAI}
              disabled={tipsLoading}
              className="px-2 py-1 text-xs rounded-md bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white flex items-center gap-1"
            >
              {tipsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Ask AI
            </button>
          </div>
          {tips && (
            <div className="text-[11px] text-white/85 whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">
              {tips}
            </div>
          )}
        </div>

        {/* Resources */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px] font-semibold text-emerald-200 uppercase tracking-wider">
            Verified resources ({resources.length})
          </span>
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
          {loading && resources.length === 0 && (
            <div className="text-xs text-white/50 py-4 text-center">Loading…</div>
          )}
          {!loading && resources.length === 0 && (
            <div className="text-xs text-white/50 py-4 text-center">No emergency resources yet.</div>
          )}
          {resources.map((r) => (
            <div key={r.id} className="p-2 rounded-md bg-black/40 border border-white/10 hover:border-red-400/40 transition-colors">
              <div className="flex items-start gap-1.5">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-white truncate">{r.title}</div>
                  {r.category && (
                    <div className="text-[10px] text-white/50 uppercase tracking-wider">{r.category}</div>
                  )}
                  {r.description && (
                    <div className="text-[11px] text-white/70 line-clamp-2 mt-0.5">{r.description}</div>
                  )}
                </div>
                <button
                  onClick={() => confirm(r.id)}
                  className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/40"
                  title="Confirm this resource is accurate"
                >
                  ✓ {r.confirmations_count ?? 0}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}