import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertTriangle, MapPin, Clock, Sparkles, ExternalLink, ArrowLeft } from "lucide-react";

type Event = {
  id: string;
  source: string;
  hazard_type: string;
  severity: number;
  magnitude: number | null;
  title: string;
  summary: string | null;
  lat: number | null;
  lon: number | null;
  region: string | null;
  country: string | null;
  event_time: string;
  url: string | null;
  raw: any;
};

const SEV = ["", "Advisory", "Watch", "Warning", "Severe", "Catastrophic"];
const SEV_COLOR = ["", "text-blue-400 border-blue-400/40 bg-blue-500/10", "text-yellow-400 border-yellow-400/40 bg-yellow-500/10", "text-orange-400 border-orange-400/40 bg-orange-500/10", "text-red-400 border-red-400/40 bg-red-500/10", "text-red-300 border-red-300/60 bg-red-900/30"];

export default function AlertReportPage() {
  const { id } = useParams();
  const [event, setEvent] = useState<Event | null>(null);
  const [related, setRelated] = useState<Event[]>([]);
  const [aiReport, setAiReport] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.from("disaster_events").select("*").eq("id", id).maybeSingle();
      setEvent(data as Event | null);
      setLoading(false);
      if (data?.lat != null && data?.lon != null) {
        const { data: near } = await supabase
          .from("disaster_events")
          .select("*")
          .eq("hazard_type", data.hazard_type)
          .neq("id", data.id)
          .gte("event_time", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
          .order("event_time", { ascending: false })
          .limit(10);
        setRelated((near ?? []) as Event[]);
      }
    })();
  }, [id]);

  const generateReport = async () => {
    if (!event) return;
    setAiLoading(true);
    setAiReport("");
    try {
      const { data, error } = await supabase.functions.invoke("emergency-ai-tips", {
        body: {
          disaster: event.hazard_type,
          context: `${event.title}. Severity ${event.severity}/5${event.magnitude ? `, magnitude ${event.magnitude}` : ""}. Location: ${event.region ?? ""} ${event.country ?? ""}. ${event.summary ?? ""}`,
        },
      });
      if (error) throw error;
      setAiReport((data as any)?.tips ?? (data as any)?.text ?? "No report available.");
    } catch (e: any) {
      setAiReport(`Unable to generate report: ${e?.message ?? String(e)}`);
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-white/60" />
    </div>
  );

  if (!event) return (
    <div className="min-h-screen bg-[#0a0a1a] text-white flex flex-col items-center justify-center gap-4">
      <AlertTriangle className="w-10 h-10 text-white/40" />
      <p className="text-white/60">Event not found</p>
      <Link to="/atlas" className="text-blue-400 text-sm">← Back to Atlas</Link>
    </div>
  );

  const sev = Math.max(1, Math.min(5, event.severity));
  const location = [event.region, event.country].filter(Boolean).join(", ") || "Unknown";

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <Link to="/atlas" className="inline-flex items-center gap-1 text-sm text-white/60 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Atlas
        </Link>

        <div className="flex flex-wrap items-start gap-3">
          <span className={`px-3 py-1 rounded-full border text-xs font-semibold ${SEV_COLOR[sev]}`}>
            {SEV[sev]} · {event.hazard_type.toUpperCase()}
          </span>
          {event.magnitude != null && (
            <span className="px-3 py-1 rounded-full border border-white/20 text-xs">M{event.magnitude}</span>
          )}
          <span className="px-3 py-1 rounded-full border border-white/20 text-xs text-white/60">via {event.source}</span>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight">{event.title}</h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-white/60">
          <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {location}</span>
          <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {new Date(event.event_time).toLocaleString()}</span>
          {event.lat != null && event.lon != null && (
            <span className="text-white/40">{event.lat.toFixed(3)}, {event.lon.toFixed(3)}</span>
          )}
        </div>

        {event.summary && (
          <div className="p-5 rounded-xl bg-white/[0.03] border border-white/10">
            <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">Summary</h2>
            <p className="text-sm leading-relaxed text-white/85 whitespace-pre-wrap">{event.summary}</p>
          </div>
        )}

        {/* Map */}
        {event.lat != null && event.lon != null && (
          <div className="rounded-xl overflow-hidden border border-white/10 aspect-video bg-black">
            <iframe
              title="Event location"
              className="w-full h-full"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${event.lon - 2},${event.lat - 2},${event.lon + 2},${event.lat + 2}&layer=mapnik&marker=${event.lat},${event.lon}`}
            />
          </div>
        )}

        {/* AI Report */}
        <div className="p-5 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-400/20">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-300" /> Situation report
            </h2>
            <button onClick={generateReport} disabled={aiLoading}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-400 disabled:opacity-50 flex items-center gap-1.5">
              {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {aiReport ? "Regenerate" : "Generate"}
            </button>
          </div>
          {aiReport ? (
            <div className="text-sm text-white/85 whitespace-pre-wrap leading-relaxed">{aiReport}</div>
          ) : (
            <p className="text-xs text-white/50">Generate an AI-written situation analysis with safety guidance.</p>
          )}
        </div>

        {/* Related events */}
        {related.length > 0 && (
          <div className="p-5 rounded-xl bg-white/[0.03] border border-white/10">
            <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">
              Recent {event.hazard_type}s (30d)
            </h2>
            <div className="space-y-1.5">
              {related.map((r) => (
                <Link key={r.id} to={`/alerts/${r.id}/report`}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 text-sm">
                  <span className="text-xs text-white/50 w-24 shrink-0">{new Date(r.event_time).toLocaleDateString()}</span>
                  <span className="flex-1 truncate">{r.title}</span>
                  {r.magnitude && <span className="text-xs text-white/60">M{r.magnitude}</span>}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Source */}
        {event.url && (
          <a href={event.url} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300">
            View source data <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}