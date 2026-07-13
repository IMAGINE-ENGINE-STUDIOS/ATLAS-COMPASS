import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, MapPin, Bell, Mail, MessageSquare, Smartphone, Globe } from "lucide-react";

type Geofence = { lat: number; lon: number; radius_km: number; label?: string };

const HAZARDS = [
  { id: "earthquake", label: "Earthquakes" },
  { id: "tsunami", label: "Tsunamis" },
  { id: "weather", label: "Severe weather" },
  { id: "wildfire", label: "Wildfires" },
  { id: "volcano", label: "Volcanoes" },
  { id: "incident", label: "Local incidents" },
];

const CHANNELS = [
  { id: "in_app", label: "In-app", icon: Bell },
  { id: "email", label: "Email", icon: Mail },
  { id: "sms", label: "SMS", icon: Smartphone },
  { id: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { id: "push", label: "Web push", icon: Globe },
];

export default function AlertsSettingsPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(true);
  const [hazards, setHazards] = useState<string[]>(["earthquake", "tsunami", "wildfire", "volcano", "weather", "incident"]);
  const [minSeverity, setMinSeverity] = useState(3);
  const [minMagnitude, setMinMagnitude] = useState(6.0);
  const [worldwide, setWorldwide] = useState(true);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [channels, setChannels] = useState<string[]>(["in_app", "email"]);
  const [phone, setPhone] = useState("");
  const [quietStart, setQuietStart] = useState<number | "">("");
  const [quietEnd, setQuietEnd] = useState<number | "">("");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        toast.error("Please sign in to configure alerts");
        setLoading(false);
        return;
      }
      setUserId(u.user.id);
      const { data } = await supabase
        .from("user_alert_subscriptions")
        .select("*")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (data) {
        setEnabled(data.enabled);
        setHazards(data.hazard_types);
        setMinSeverity(data.min_severity);
        setMinMagnitude(Number(data.min_magnitude));
        setWorldwide(data.worldwide);
        setGeofences((data.geofences as any) ?? []);
        setChannels(data.channels);
        setPhone(data.phone_e164 ?? "");
        setQuietStart(data.quiet_hours_start ?? "");
        setQuietEnd(data.quiet_hours_end ?? "");
      }
      setLoading(false);
    })();
  }, []);

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const addGeofence = () => {
    const label = prompt("Region name (e.g. San Francisco Bay Area)");
    if (!label) return;
    const latStr = prompt("Latitude (-90 to 90)");
    const lonStr = prompt("Longitude (-180 to 180)");
    const rStr = prompt("Radius in km", "200");
    const lat = Number(latStr), lon = Number(lonStr), radius_km = Number(rStr);
    if (![lat, lon, radius_km].every(Number.isFinite)) return toast.error("Invalid coordinates");
    setGeofences([...geofences, { lat, lon, radius_km, label }]);
  };

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    const payload = {
      user_id: userId,
      enabled,
      hazard_types: hazards,
      min_severity: minSeverity,
      min_magnitude: minMagnitude,
      worldwide,
      geofences: geofences as any,
      channels,
      phone_e164: phone || null,
      quiet_hours_start: quietStart === "" ? null : Number(quietStart),
      quiet_hours_end: quietEnd === "" ? null : Number(quietEnd),
    };
    const { error } = await supabase
      .from("user_alert_subscriptions")
      .upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) return toast.error("Save failed", { description: error.message });
    toast.success("Alert preferences saved");
  };

  const sendTest = async (channel: string) => {
    const { error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "disaster-alert",
        recipientEmail: (await supabase.auth.getUser()).data.user?.email,
        idempotencyKey: `test-${channel}-${Date.now()}`,
        templateData: {
          title: "TEST · M6.4 earthquake near Antakya",
          hazardType: "earthquake",
          severity: 4,
          magnitude: 6.4,
          region: "Antakya",
          country: "Türkiye",
          summary: "This is a test alert triggered from your settings.",
          eventTime: new Date().toISOString(),
          lat: 36.2, lon: 36.15,
          onePagerUrl: `${window.location.origin}/alerts/test`,
          reportUrl: `${window.location.origin}/alerts/test/report`,
        },
      },
    });
    if (error) return toast.error(`Test ${channel} failed`, { description: error.message });
    toast.success(`Test ${channel} queued`);
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-white/60" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Alert preferences</h1>
            <p className="text-sm text-white/50 mt-1">Choose which disasters, where, and how you're notified.</p>
          </div>
          <button onClick={() => nav(-1)} className="text-sm text-white/60 hover:text-white">← Back</button>
        </div>

        <Section title="Master switch">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 accent-blue-500" />
            <span className="text-sm">{enabled ? "Alerts are enabled" : "All alerts paused"}</span>
          </label>
        </Section>

        <Section title="Hazard types">
          <div className="grid grid-cols-2 gap-2">
            {HAZARDS.map((h) => (
              <label key={h.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer">
                <input type="checkbox" checked={hazards.includes(h.id)}
                  onChange={() => toggle(hazards, h.id, setHazards)}
                  className="w-4 h-4 accent-blue-500" />
                <span className="text-sm">{h.label}</span>
              </label>
            ))}
          </div>
        </Section>

        <Section title="Thresholds">
          <label className="block text-xs text-white/60 mb-1">Minimum severity: <b>{minSeverity}/5</b></label>
          <input type="range" min={1} max={5} value={minSeverity}
            onChange={(e) => setMinSeverity(Number(e.target.value))} className="w-full accent-blue-500" />
          <label className="block text-xs text-white/60 mt-4 mb-1">Minimum earthquake magnitude: <b>M{minMagnitude.toFixed(1)}</b></label>
          <input type="range" min={3} max={9} step={0.1} value={minMagnitude}
            onChange={(e) => setMinMagnitude(Number(e.target.value))} className="w-full accent-blue-500" />
        </Section>

        <Section title="Regions">
          <label className="flex items-center gap-2 mb-3 cursor-pointer">
            <input type="checkbox" checked={worldwide} onChange={(e) => setWorldwide(e.target.checked)}
              className="w-4 h-4 accent-blue-500" />
            <span className="text-sm">Alert me worldwide (uncheck to only get events near geofences)</span>
          </label>
          <div className="space-y-2">
            {geofences.map((g, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                <MapPin className="w-4 h-4 text-blue-400" />
                <div className="flex-1 text-sm">
                  <div className="font-medium">{g.label || "Unnamed"}</div>
                  <div className="text-xs text-white/50">{g.lat.toFixed(2)}, {g.lon.toFixed(2)} · {g.radius_km} km radius</div>
                </div>
                <button onClick={() => setGeofences(geofences.filter((_, j) => j !== i))}
                  className="text-white/40 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <button onClick={addGeofence}
            className="mt-3 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-blue-500/20 border border-blue-400/40 hover:bg-blue-500/30">
            <Plus className="w-3.5 h-3.5" /> Add region
          </button>
        </Section>

        <Section title="Channels">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {CHANNELS.map((c) => {
              const Icon = c.icon;
              const active = channels.includes(c.id);
              return (
                <div key={c.id} className={`p-3 rounded-lg border ${active ? "bg-blue-500/10 border-blue-400/40" : "bg-white/5 border-white/10"}`}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={active}
                      onChange={() => toggle(channels, c.id, setChannels)}
                      className="w-4 h-4 accent-blue-500" />
                    <Icon className="w-4 h-4" />
                    <span className="text-sm">{c.label}</span>
                  </label>
                  {active && (c.id === "email" || c.id === "sms" || c.id === "whatsapp") && (
                    <button onClick={() => sendTest(c.id)}
                      className="mt-2 text-[11px] text-blue-300 hover:text-blue-200">Send test →</button>
                  )}
                </div>
              );
            })}
          </div>
          {(channels.includes("sms") || channels.includes("whatsapp")) && (
            <div className="mt-3">
              <label className="block text-xs text-white/60 mb-1">Phone (E.164, e.g. +14155551234)</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="+14155551234"
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-blue-400" />
            </div>
          )}
        </Section>

        <Section title="Quiet hours (UTC)">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/60 mb-1">Start hour</label>
              <input type="number" min={0} max={23} value={quietStart}
                onChange={(e) => setQuietStart(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="e.g. 22"
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">End hour</label>
              <input type="number" min={0} max={23} value={quietEnd}
                onChange={(e) => setQuietEnd(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="e.g. 7"
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm" />
            </div>
          </div>
          <p className="text-[11px] text-white/40 mt-2">Severe (4+) and catastrophic (5) alerts always send, even during quiet hours.</p>
        </Section>

        <div className="flex items-center gap-3 pt-2">
          <button onClick={save} disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-sm font-semibold flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save preferences
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-5 rounded-xl bg-white/[0.03] border border-white/10">
      <h2 className="text-sm font-semibold text-white/80 uppercase tracking-wider mb-3">{title}</h2>
      {children}
    </div>
  );
}