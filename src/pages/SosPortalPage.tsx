import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Bell, BellRing, Film, Newspaper, Play, Radio, Send,
  Share2, Shield, Sparkles, Video, X, Loader2, MapPin, ExternalLink,
  Flame, Waves, Wind, Zap, Cloud, Activity, ArrowLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type SosPost = {
  id: string;
  author_id: string | null;
  kind: "warning" | "news" | "video" | "short" | "post";
  title: string;
  body: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  hazard_type: string | null;
  severity: number | null;
  lat: number | null;
  lon: number | null;
  region: string | null;
  source_url: string | null;
  tags: string[] | null;
  share_count: number;
  like_count: number;
  is_pinned: boolean;
  created_at: string;
};

type AlertEvent = {
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

const HAZARD_ICON: Record<string, typeof Flame> = {
  earthquake: Activity,
  wildfire: Flame,
  flood: Waves,
  hurricane: Wind,
  tornado: Wind,
  storm: Cloud,
  lightning: Zap,
};

const KIND_META = {
  warning: { label: "WARNING", icon: AlertTriangle, color: "text-red-300 border-red-500/50 bg-red-500/10" },
  news: { label: "News", icon: Newspaper, color: "text-sky-300 border-sky-500/40 bg-sky-500/10" },
  video: { label: "Video", icon: Video, color: "text-violet-300 border-violet-500/40 bg-violet-500/10" },
  short: { label: "Short", icon: Film, color: "text-fuchsia-300 border-fuchsia-500/40 bg-fuchsia-500/10" },
  post: { label: "Post", icon: Radio, color: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10" },
} as const;

const FILTERS = ["all", "warning", "news", "video", "short", "post"] as const;

function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function SosPortalPage() {
  const [posts, setPosts] = useState<SosPost[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState<boolean>(
    typeof Notification !== "undefined" && Notification.permission === "granted",
  );
  const [userId, setUserId] = useState<string | null>(null);
  const bannerRef = useRef<AlertEvent | null>(null);

  // Auth (SOS allows anonymous browsing, but posting requires session)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUserId(s?.user?.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Initial load
  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: a }] = await Promise.all([
        supabase.from("sos_posts").select("*").order("is_pinned", { ascending: false }).order("created_at", { ascending: false }).limit(80),
        supabase.from("disaster_events").select("id,hazard_type,severity,magnitude,title,summary,region,country,event_time,url").order("event_time", { ascending: false }).limit(30),
      ]);
      setPosts((p ?? []) as SosPost[]);
      setAlerts((a ?? []) as AlertEvent[]);
    })();
  }, []);

  // Realtime: new posts + new disaster events -> banner + optional push notification
  useEffect(() => {
    const postCh = supabase
      .channel("sos_posts_rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sos_posts" }, (payload) => {
        const row = payload.new as SosPost;
        setPosts((prev) => [row, ...prev.filter((x) => x.id !== row.id)].slice(0, 100));
        if (row.kind === "warning") {
          toast.warning(`⚠️ ${row.title}`, { description: row.body?.slice(0, 120) });
          maybePush(`⚠️ ${row.title}`, row.body ?? "New warning posted on SOS.");
        }
      })
      .subscribe();
    const alertCh = supabase
      .channel("disaster_events_rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "disaster_events" }, (payload) => {
        const row = payload.new as AlertEvent;
        setAlerts((prev) => [row, ...prev].slice(0, 30));
        bannerRef.current = row;
        toast(`${row.hazard_type.toUpperCase()} · ${row.title}`, { description: row.region ?? row.country ?? "" });
        maybePush(`🚨 ${row.title}`, row.summary ?? row.region ?? "New alert");
      })
      .subscribe();
    return () => {
      supabase.removeChannel(postCh);
      supabase.removeChannel(alertCh);
    };
  }, []);

  function maybePush(title: string, body: string) {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(title, { body, icon: "/placeholder.svg", tag: "sos-alert" });
      }
    } catch {
      /* noop */
    }
  }

  async function requestPush() {
    if (typeof Notification === "undefined") {
      toast.error("Notifications not supported on this device");
      return;
    }
    const res = await Notification.requestPermission();
    setPushEnabled(res === "granted");
    if (res === "granted") {
      toast.success("You'll be warned in real time.");
      new Notification("SOS notifications enabled", { body: "You will receive warnings as they happen." });
    }
  }

  async function share(post: SosPost) {
    const url = `${window.location.origin}/sos#post-${post.id}`;
    const shareData = { title: `SOS · ${post.title}`, text: post.body ?? post.title, url };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
      }
      await supabase.from("sos_posts").update({ share_count: post.share_count + 1 }).eq("id", post.id);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, share_count: p.share_count + 1 } : p)));
    } catch {
      /* user cancelled */
    }
  }

  async function shareAlert(a: AlertEvent) {
    const url = `${window.location.origin}/alerts/${a.id}`;
    const shareData = { title: `Alert · ${a.title}`, text: a.summary ?? a.title, url };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      /* noop */
    }
  }

  const feed = useMemo(() => {
    if (filter === "all") return posts;
    return posts.filter((p) => p.kind === filter);
  }, [posts, filter]);

  return (
    <div className="min-h-screen bg-[#07070d] text-white">
      {/* Ambient glow */}
      <div aria-hidden className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-red-500/10 blur-[140px]" />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-sky-500/10 blur-[140px]" />
      </div>

      <header className="sticky top-0 z-30 backdrop-blur-xl bg-black/40 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="text-white/60 hover:text-white transition">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.5)]">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-widest text-white">SOS PORTAL</div>
              <div className="text-[10px] text-white/50 uppercase tracking-wider">Climate & Catastrophe Feed</div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={requestPush}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                pushEnabled
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                  : "border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
              }`}
            >
              {pushEnabled ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
              {pushEnabled ? "Warned" : "Get warned"}
            </button>
            <Link
              to="/settings/alerts"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-white/15 bg-white/5 hover:bg-white/10"
            >
              <Sparkles className="w-3.5 h-3.5" /> Subscribe
            </Link>
            <button
              onClick={() => setWarnOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.5)] animate-pulse"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              WARN
            </button>
          </div>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-4 py-6 grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Feed */}
        <section>
          {/* Filter pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-3 scrollbar-none">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition ${
                  filter === f
                    ? "bg-white text-black border-white"
                    : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
                }`}
              >
                {f === "all" ? "All" : KIND_META[f].label}
              </button>
            ))}
            <button
              onClick={() => setComposerOpen(true)}
              className="ml-auto px-3 py-1.5 rounded-full text-xs font-medium bg-white/10 hover:bg-white/15 border border-white/15 flex items-center gap-1"
            >
              <Send className="w-3 h-3" /> Post
            </button>
          </div>

          {/* Mobile subscribe row */}
          <div className="sm:hidden flex gap-2 mb-3">
            <button
              onClick={requestPush}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border ${
                pushEnabled
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                  : "border-white/15 bg-white/5 text-white/80"
              }`}
            >
              {pushEnabled ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
              {pushEnabled ? "Warned" : "Get warned"}
            </button>
            <Link
              to="/settings/alerts"
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-white/15 bg-white/5"
            >
              <Sparkles className="w-3.5 h-3.5" /> Subscribe
            </Link>
          </div>

          {/* Feed items */}
          <div className="space-y-3">
            {feed.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center text-white/50 text-sm">
                No posts yet. Be the first to share.
              </div>
            )}
            {feed.map((p) => (
              <PostCard key={p.id} post={p} onShare={() => share(p)} />
            ))}
          </div>
        </section>

        {/* Live alerts sidebar */}
        <aside className="space-y-3 lg:sticky lg:top-20 self-start">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-white/90">Live Alerts</span>
              <Link to="/settings/alerts" className="ml-auto text-[10px] text-sky-300 hover:underline">Tune</Link>
            </div>
            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {alerts.length === 0 && (
                <div className="text-xs text-white/50 py-6 text-center">No active alerts.</div>
              )}
              {alerts.map((a) => {
                const Icon = HAZARD_ICON[a.hazard_type] ?? AlertTriangle;
                return (
                  <div key={a.id} className="rounded-xl border border-white/10 bg-black/40 p-2.5 hover:border-red-400/40 transition group">
                    <div className="flex items-start gap-2">
                      <div className="w-8 h-8 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-red-300" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] uppercase tracking-wider text-red-300 font-bold">
                            {a.hazard_type}
                          </span>
                          {a.severity != null && (
                            <span className="text-[9px] px-1 rounded bg-red-500/20 text-red-200">S{a.severity}</span>
                          )}
                          <span className="ml-auto text-[9px] text-white/40">{timeAgo(a.event_time)}</span>
                        </div>
                        <div className="text-xs font-medium text-white truncate">{a.title}</div>
                        {(a.region || a.country) && (
                          <div className="text-[10px] text-white/50 flex items-center gap-1 truncate">
                            <MapPin className="w-2.5 h-2.5" />
                            {a.region ?? a.country}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <Link
                            to={`/alerts/${a.id}`}
                            className="text-[10px] text-sky-300 hover:underline flex items-center gap-0.5"
                          >
                            Report <ExternalLink className="w-2.5 h-2.5" />
                          </Link>
                          <button
                            onClick={() => shareAlert(a)}
                            className="text-[10px] text-white/60 hover:text-white flex items-center gap-0.5"
                          >
                            <Share2 className="w-2.5 h-2.5" /> Share
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </main>

      {composerOpen && (
        <Composer
          userId={userId}
          onClose={() => setComposerOpen(false)}
          onPosted={(row) => setPosts((prev) => [row, ...prev])}
        />
      )}
      {warnOpen && (
        <Composer
          userId={userId}
          forceWarning
          onClose={() => setWarnOpen(false)}
          onPosted={(row) => setPosts((prev) => [row, ...prev])}
        />
      )}
    </div>
  );
}

function PostCard({ post, onShare }: { post: SosPost; onShare: () => void }) {
  const meta = KIND_META[post.kind];
  const Icon = meta.icon;
  const isVideo = post.kind === "video" || post.kind === "short";
  const isWarning = post.kind === "warning";
  return (
    <article
      id={`post-${post.id}`}
      className={`rounded-2xl border overflow-hidden backdrop-blur-xl transition ${
        isWarning
          ? "border-red-500/50 bg-red-950/30 shadow-[0_0_30px_rgba(239,68,68,0.25)]"
          : "border-white/10 bg-white/[0.03] hover:border-white/20"
      }`}
    >
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${meta.color}`}>
            <Icon className="w-3 h-3" /> {meta.label}
          </span>
          {post.hazard_type && (
            <span className="text-[10px] uppercase tracking-wider text-white/50">{post.hazard_type}</span>
          )}
          {post.region && (
            <span className="text-[10px] text-white/40 flex items-center gap-0.5">
              <MapPin className="w-2.5 h-2.5" /> {post.region}
            </span>
          )}
          <span className="ml-auto text-[10px] text-white/40">{timeAgo(post.created_at)}</span>
        </div>
        <h3 className={`font-semibold ${isWarning ? "text-red-100 text-lg" : "text-white text-base"}`}>
          {post.title}
        </h3>
        {post.body && <p className="mt-1 text-sm text-white/75 whitespace-pre-wrap">{post.body}</p>}
      </div>

      {post.media_url && (
        <div className={`relative bg-black ${post.kind === "short" ? "aspect-[9/16] max-h-[520px]" : "aspect-video"} overflow-hidden`}>
          {isVideo ? (
            <video
              src={post.media_url}
              poster={post.thumbnail_url ?? undefined}
              controls
              playsInline
              className="w-full h-full object-contain bg-black"
            />
          ) : (
            <img src={post.media_url} alt={post.title} className="w-full h-full object-cover" loading="lazy" />
          )}
          {isVideo && !post.thumbnail_url && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <Play className="w-10 h-10 text-white/40" />
            </div>
          )}
        </div>
      )}

      <div className="px-4 py-2 flex items-center gap-4 border-t border-white/5 text-xs text-white/60">
        {post.source_url && (
          <a href={post.source_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-white">
            <ExternalLink className="w-3 h-3" /> Source
          </a>
        )}
        <button onClick={onShare} className="flex items-center gap-1 hover:text-white ml-auto">
          <Share2 className="w-3.5 h-3.5" /> {post.share_count > 0 ? post.share_count : "Share"}
        </button>
      </div>
    </article>
  );
}

function Composer({
  userId, onClose, onPosted, forceWarning = false,
}: {
  userId: string | null;
  onClose: () => void;
  onPosted: (row: SosPost) => void;
  forceWarning?: boolean;
}) {
  const [kind, setKind] = useState<SosPost["kind"]>(forceWarning ? "warning" : "post");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [hazardType, setHazardType] = useState("");
  const [region, setRegion] = useState("");
  const [severity, setSeverity] = useState<number>(3);
  const [busy, setBusy] = useState(false);

  const isWarn = kind === "warning";

  async function submit() {
    if (!title.trim()) return toast.error("Title required");
    setBusy(true);
    let uid = userId;
    if (!uid) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.user) {
        setBusy(false);
        return toast.error("Sign-in required to post");
      }
      uid = data.user.id;
    }
    const payload = {
      author_id: uid,
      kind,
      title: title.trim(),
      body: body.trim() || null,
      media_url: mediaUrl.trim() || null,
      source_url: sourceUrl.trim() || null,
      hazard_type: hazardType.trim() || null,
      region: region.trim() || null,
      severity: isWarn ? severity : null,
    };
    const { data, error } = await supabase.from("sos_posts").insert(payload).select().single();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(isWarn ? "Warning broadcast" : "Posted");
    onPosted(data as SosPost);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-2 sm:p-4">
      <div className={`w-full max-w-lg rounded-2xl border ${isWarn ? "border-red-500/50 bg-red-950/50" : "border-white/10 bg-[#0e0e18]"} backdrop-blur-xl shadow-2xl`}>
        <div className="flex items-center gap-2 p-4 border-b border-white/10">
          {isWarn ? <AlertTriangle className="w-5 h-5 text-red-400" /> : <Send className="w-5 h-5 text-white/70" />}
          <div className="font-semibold text-white">{isWarn ? "Broadcast a warning" : "New SOS post"}</div>
          <button onClick={onClose} className="ml-auto text-white/60 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {!forceWarning && (
            <div className="flex gap-1.5 flex-wrap">
              {(["post", "news", "video", "short", "warning"] as const).map((k) => {
                const m = KIND_META[k];
                const Icon = m.icon;
                return (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1 ${
                      kind === k ? m.color : "bg-white/5 text-white/60 border-white/10"
                    }`}
                  >
                    <Icon className="w-3 h-3" /> {m.label}
                  </button>
                );
              })}
            </div>
          )}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isWarn ? "What's happening? (e.g., Flash flood on Main St)" : "Title"}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/30"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={isWarn ? "Add details: location, hazards, what people should do…" : "Say something…"}
            rows={4}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/30 resize-none"
          />
          {(kind === "video" || kind === "short") && (
            <input
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="Video URL (mp4)"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/40"
            />
          )}
          {kind === "post" && (
            <input
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="Image URL (optional)"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/40"
            />
          )}
          {kind === "news" && (
            <input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="Source link (https://…)"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/40"
            />
          )}
          <div className="grid grid-cols-2 gap-2">
            <input
              value={hazardType}
              onChange={(e) => setHazardType(e.target.value)}
              placeholder="Hazard (flood, fire…)"
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/40"
            />
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Region"
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/40"
            />
          </div>
          {isWarn && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">Severity: {severity}</div>
              <input
                type="range" min={1} max={5} value={severity}
                onChange={(e) => setSeverity(Number(e.target.value))}
                className="w-full accent-red-500"
              />
            </div>
          )}
        </div>
        <div className="p-4 border-t border-white/10 flex gap-2">
          <button onClick={onClose} className="flex-1 px-3 py-2 rounded-lg text-sm bg-white/5 hover:bg-white/10 text-white/80">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 ${
              isWarn ? "bg-red-600 hover:bg-red-500 text-white" : "bg-white text-black hover:bg-white/90"
            } disabled:opacity-50`}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : isWarn ? <AlertTriangle className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            {isWarn ? "Broadcast warning" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}