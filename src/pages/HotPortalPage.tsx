import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Bell, BellRing, Bookmark, Film, Heart, Home, MapPin,
  MessageCircle, Newspaper, Play, PlusSquare, Radio, Search, Send,
  Share2, Shield, Sparkles, Video, X, Loader2, ExternalLink,
  Flame, Waves, Wind, Zap, Cloud, Activity, ArrowLeft, MoreHorizontal, BadgeCheck,
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

// Any item rendered in the feed: user posts OR agency broadcasts.
type FeedItem =
  | { type: "post"; post: SosPost; ts: number }
  | { type: "broadcast"; item: Broadcast; ts: number };

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
  warning: { label: "WARNING", icon: AlertTriangle, ring: "from-red-500 via-orange-500 to-amber-400" },
  news:    { label: "News",    icon: Newspaper,     ring: "from-sky-400 via-cyan-400 to-blue-500" },
  video:   { label: "Video",   icon: Video,         ring: "from-violet-500 via-fuchsia-500 to-pink-500" },
  short:   { label: "Short",   icon: Film,          ring: "from-fuchsia-500 via-pink-500 to-rose-500" },
  post:    { label: "Post",    icon: Radio,         ring: "from-emerald-400 via-teal-400 to-cyan-400" },
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

function handleFor(id: string | null, fallback = "hot_reporter") {
  if (!id) return fallback;
  return "hot_" + id.replace(/-/g, "").slice(0, 8);
}

function avatarGradient(seed: string) {
  const palettes = [
    "from-fuchsia-500 to-orange-400",
    "from-sky-400 to-emerald-400",
    "from-red-500 to-amber-400",
    "from-violet-500 to-pink-500",
    "from-cyan-400 to-blue-600",
    "from-lime-400 to-teal-500",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return palettes[Math.abs(h) % palettes.length];
}

export default function HotPortalPage() {
  const [posts, setPosts] = useState<SosPost[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState<boolean>(
    typeof Notification !== "undefined" && Notification.permission === "granted",
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [storyOpen, setStoryOpen] = useState<AlertEvent | null>(null);
  const bannerRef = useRef<AlertEvent | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUserId(s?.user?.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

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

  // Free news broadcasts from USGS, NASA EONET, GDACS, ReliefWeb, NOAA.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data, error } = await supabase.functions.invoke("hot-news", { body: {} });
        if (cancelled || error || !data?.items) return;
        setBroadcasts(data.items as Broadcast[]);
      } catch { /* offline / edge fn cold */ }
    }
    load();
    const t = setInterval(load, 5 * 60 * 1000); // refresh every 5 min
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  useEffect(() => {
    const postCh = supabase
      .channel("sos_posts_rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sos_posts" }, (payload) => {
        const row = payload.new as SosPost;
        setPosts((prev) => [row, ...prev.filter((x) => x.id !== row.id)].slice(0, 100));
        if (row.kind === "warning") {
          toast.warning(`⚠️ ${row.title}`, { description: row.body?.slice(0, 120) });
          maybePush(`⚠️ ${row.title}`, row.body ?? "New warning posted on HOT.");
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
    } catch { /* noop */ }
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
      new Notification("HOT notifications enabled", { body: "You will receive warnings as they happen." });
    }
  }

  async function share(post: SosPost) {
    const url = `${window.location.origin}/hot#post-${post.id}`;
    const shareData = { title: `HOT · ${post.title}`, text: post.body ?? post.title, url };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
      }
      await supabase.from("sos_posts").update({ share_count: post.share_count + 1 }).eq("id", post.id);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, share_count: p.share_count + 1 } : p)));
    } catch { /* cancelled */ }
  }

  async function toggleLike(post: SosPost) {
    const isLiked = liked.has(post.id);
    const next = new Set(liked);
    if (isLiked) next.delete(post.id); else next.add(post.id);
    setLiked(next);
    const delta = isLiked ? -1 : 1;
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, like_count: Math.max(0, p.like_count + delta) } : p)));
    await supabase.from("sos_posts").update({ like_count: Math.max(0, post.like_count + delta) }).eq("id", post.id);
  }

  function toggleSave(id: string) {
    const next = new Set(saved);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSaved(next);
  }

  const feed = useMemo<FeedItem[]>(() => {
    const p: FeedItem[] = posts
      .filter((x) => filter === "all" || x.kind === filter)
      .map((post) => ({ type: "post" as const, post, ts: +new Date(post.created_at) }));
    const b: FeedItem[] = broadcasts
      .filter((x) => filter === "all" || filter === "news" || filter === "warning" ? true : false)
      .filter((x) => filter === "all" || x.kind === filter)
      .map((item) => ({ type: "broadcast" as const, item, ts: +new Date(item.event_time) }));
    return [...p, ...b].sort((a, z) => z.ts - a.ts).slice(0, 120);
  }, [posts, broadcasts, filter]);

  return (
    <div className="min-h-screen bg-black text-white pb-24 sm:pb-6">
      {/* Ambient glow */}
      <div aria-hidden className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full bg-red-500/10 blur-[140px]" />
        <div className="absolute -bottom-40 -right-40 w-[520px] h-[520px] rounded-full bg-fuchsia-500/10 blur-[140px]" />
      </div>

      {/* Top bar — Instagram style */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-black/70 border-b border-white/10">
        <div className="max-w-[500px] mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/" className="text-white/60 hover:text-white transition sm:hidden">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.5)]">
              <Shield className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-xl tracking-tight font-bold" style={{ fontFamily: "'SF Pro Display', system-ui" }}>
              hot<span className="text-gradient bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">gram</span>
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button onClick={requestPush} className="text-white/80 hover:text-white transition" aria-label="Notifications">
              {pushEnabled ? <BellRing className="w-6 h-6 text-emerald-300" /> : <Bell className="w-6 h-6" />}
            </button>
            <Link to="/settings/alerts" className="text-white/80 hover:text-white transition" aria-label="Subscribe">
              <Sparkles className="w-6 h-6" />
            </Link>
            <button
              onClick={() => setWarnOpen(true)}
              className="flex items-center gap-1 px-3 h-8 rounded-full text-[11px] font-bold bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.5)]"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              WARN
            </button>
          </div>
        </div>
      </header>

      <main className="relative max-w-[500px] mx-auto">
        {/* Stories row — live alerts as story rings */}
        <div className="border-b border-white/10">
          <div className="flex gap-3 px-4 py-3 overflow-x-auto scrollbar-none">
            {/* Your story (compose) */}
            <button onClick={() => setComposerOpen(true)} className="flex flex-col items-center gap-1 shrink-0">
              <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-neutral-800 to-neutral-900 border border-white/10 flex items-center justify-center">
                <PlusSquare className="w-6 h-6 text-white/70" />
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-sky-500 border-2 border-black flex items-center justify-center">
                  <span className="text-[10px] font-bold leading-none">+</span>
                </div>
              </div>
              <span className="text-[10px] text-white/70">Your post</span>
            </button>

            {alerts.slice(0, 20).map((a) => {
              const Icon = HAZARD_ICON[a.hazard_type] ?? AlertTriangle;
              return (
                <button
                  key={a.id}
                  onClick={() => setStoryOpen(a)}
                  className="flex flex-col items-center gap-1 shrink-0"
                >
                  <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-tr from-red-500 via-orange-500 to-amber-400">
                    <div className="w-full h-full rounded-full bg-black p-[2px]">
                      <div className="w-full h-full rounded-full bg-gradient-to-br from-neutral-800 to-black flex items-center justify-center">
                        <Icon className="w-6 h-6 text-red-300" />
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-white/70 max-w-[64px] truncate">
                    {a.region ?? a.country ?? a.hazard_type}
                  </span>
                </button>
              );
            })}
            {alerts.length === 0 && (
              <div className="flex items-center text-[11px] text-white/40 px-2">No live alerts</div>
            )}
          </div>
        </div>

        {/* Filter pills (compact tab bar under stories) */}
        <div className="sticky top-14 z-20 bg-black/70 backdrop-blur-xl border-b border-white/10">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none px-4 py-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition ${
                  filter === f
                    ? "bg-white text-black"
                    : "bg-white/5 text-white/70 hover:bg-white/10"
                }`}
              >
                {f === "all" ? "For you" : KIND_META[f].label}
              </button>
            ))}
          </div>
        </div>

        {/* Feed */}
        <section className="divide-y divide-white/5">
          {feed.length === 0 && (
            <div className="p-12 text-center text-white/50 text-sm">
              Nothing here yet. Tap the <span className="text-white">+</span> to post.
            </div>
          )}
          {feed.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              liked={liked.has(p.id)}
              saved={saved.has(p.id)}
              onLike={() => toggleLike(p)}
              onSave={() => toggleSave(p.id)}
              onShare={() => share(p)}
            />
          ))}
        </section>
      </main>

      {/* Bottom tab bar (mobile IG style) */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-black/90 backdrop-blur-xl border-t border-white/10">
        <div className="max-w-[500px] mx-auto h-14 grid grid-cols-5">
          <TabButton icon={<Home className="w-6 h-6" />} label="Home" active />
          <TabButton icon={<Search className="w-6 h-6" />} label="Explore" onClick={() => setFilter("news")} />
          <button
            onClick={() => setComposerOpen(true)}
            className="flex flex-col items-center justify-center text-white/80"
            aria-label="New post"
          >
            <PlusSquare className="w-6 h-6" />
          </button>
          <TabButton icon={<Film className="w-6 h-6" />} label="Shorts" onClick={() => setFilter("short")} />
          <button
            onClick={() => setWarnOpen(true)}
            className="flex flex-col items-center justify-center"
            aria-label="Warn"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-[0_0_16px_rgba(239,68,68,0.6)]">
              <AlertTriangle className="w-4 h-4 text-white" />
            </div>
          </button>
        </div>
      </nav>

      {storyOpen && <StoryViewer alert={storyOpen} onClose={() => setStoryOpen(null)} />}
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

function TabButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center transition ${active ? "text-white" : "text-white/60"}`}
      aria-label={label}
    >
      {icon}
    </button>
  );
}

function PostCard({
  post, liked, saved, onLike, onSave, onShare,
}: {
  post: SosPost;
  liked: boolean;
  saved: boolean;
  onLike: () => void;
  onSave: () => void;
  onShare: () => void;
}) {
  const meta = KIND_META[post.kind];
  const Icon = meta.icon;
  const isVideo = post.kind === "video" || post.kind === "short";
  const isWarning = post.kind === "warning";
  const handle = handleFor(post.author_id);
  const avatar = avatarGradient(post.author_id ?? post.id);

  return (
    <article id={`post-${post.id}`} className={isWarning ? "bg-gradient-to-b from-red-950/40 to-transparent" : ""}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        <div className={`w-9 h-9 rounded-full p-[2px] bg-gradient-to-tr ${meta.ring}`}>
          <div className="w-full h-full rounded-full bg-black p-[1.5px]">
            <div className={`w-full h-full rounded-full bg-gradient-to-br ${avatar} flex items-center justify-center`}>
              <Icon className="w-4 h-4 text-white/95 drop-shadow" />
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold truncate">{handle}</span>
            {isWarning && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/90 text-white">WARN</span>
            )}
            {post.is_pinned && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/15 text-white/80">PINNED</span>
            )}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-white/50">
            {post.region && (
              <>
                <MapPin className="w-3 h-3" />
                <span className="truncate">{post.region}</span>
                <span>·</span>
              </>
            )}
            <span>{timeAgo(post.created_at)}</span>
          </div>
        </div>
        <button className="text-white/60 hover:text-white" aria-label="More">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* Media */}
      {post.media_url ? (
        <div className={`relative bg-black ${post.kind === "short" ? "aspect-[9/16] max-h-[620px]" : "aspect-square"} overflow-hidden`}>
          {isVideo ? (
            <video
              src={post.media_url}
              poster={post.thumbnail_url ?? undefined}
              controls
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <img src={post.media_url} alt={post.title} className="w-full h-full object-cover" loading="lazy" />
          )}
          {isVideo && !post.thumbnail_url && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <Play className="w-12 h-12 text-white/50" />
            </div>
          )}
          {isWarning && (
            <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-1 rounded-full bg-red-600/90 backdrop-blur text-white text-[10px] font-bold uppercase tracking-wider shadow-lg">
              <AlertTriangle className="w-3 h-3" /> Live warning
              {post.severity != null && <span className="ml-1 opacity-80">S{post.severity}</span>}
            </div>
          )}
        </div>
      ) : (
        // Text-only card — big typographic tile so it still reads like a photo post
        <div className={`relative overflow-hidden ${isWarning ? "bg-gradient-to-br from-red-900 via-red-950 to-black" : "bg-gradient-to-br from-neutral-900 via-black to-neutral-950"} aspect-square flex items-center justify-center p-8`}>
          <div aria-hidden className={`absolute inset-0 opacity-30 bg-gradient-to-br ${meta.ring}`} style={{ mixBlendMode: "overlay" }} />
          <h3 className={`relative text-2xl font-bold leading-tight text-center ${isWarning ? "text-red-50" : "text-white"}`}>
            {post.title}
          </h3>
          {isWarning && (
            <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-1 rounded-full bg-red-600/90 text-white text-[10px] font-bold uppercase tracking-wider">
              <AlertTriangle className="w-3 h-3" /> Live warning
            </div>
          )}
        </div>
      )}

      {/* Action bar */}
      <div className="px-4 pt-3 pb-1 flex items-center gap-4">
        <button onClick={onLike} className="transition active:scale-90" aria-label="Like">
          <Heart className={`w-6 h-6 ${liked ? "fill-red-500 text-red-500" : "text-white"}`} />
        </button>
        <button className="transition active:scale-90" aria-label="Comment">
          <MessageCircle className="w-6 h-6 text-white" />
        </button>
        <button onClick={onShare} className="transition active:scale-90" aria-label="Share">
          <Send className="w-6 h-6 text-white -rotate-12" />
        </button>
        <button onClick={onSave} className="ml-auto transition active:scale-90" aria-label="Save">
          <Bookmark className={`w-6 h-6 ${saved ? "fill-white text-white" : "text-white"}`} />
        </button>
      </div>

      {/* Likes + caption */}
      <div className="px-4 pb-4 text-sm">
        {post.like_count > 0 && (
          <div className="font-semibold">{post.like_count.toLocaleString()} {post.like_count === 1 ? "like" : "likes"}</div>
        )}
        {post.media_url && (
          <div className="mt-1">
            <span className="font-semibold mr-2">{handle}</span>
            <span className="text-white/90">{post.title}</span>
          </div>
        )}
        {post.body && (
          <p className="mt-1 text-white/75 whitespace-pre-wrap line-clamp-4">
            {!post.media_url && <span className="font-semibold mr-2 text-white">{handle}</span>}
            {post.body}
          </p>
        )}
        <div className="mt-2 flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/50">
          {post.hazard_type && <span className="text-sky-300">#{post.hazard_type}</span>}
          {post.tags?.slice(0, 4).map((t) => (
            <span key={t} className="text-sky-300">#{t}</span>
          ))}
          {post.source_url && (
            <a href={post.source_url} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-0.5 hover:text-white">
              <ExternalLink className="w-3 h-3" /> Source
            </a>
          )}
          {post.share_count > 0 && <span>· {post.share_count} shares</span>}
        </div>
      </div>
    </article>
  );
}

function StoryViewer({ alert, onClose }: { alert: AlertEvent; onClose: () => void }) {
  const Icon = HAZARD_ICON[alert.hazard_type] ?? AlertTriangle;
  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col" onClick={onClose}>
      <div className="h-1 mx-4 mt-3 rounded-full bg-white/20 overflow-hidden">
        <div className="h-full w-full bg-white origin-left" style={{ animation: "hotStory 10s linear forwards" }} />
      </div>
      <style>{`@keyframes hotStory { from { transform: scaleX(0) } to { transform: scaleX(1) } }`}</style>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-full p-[2px] bg-gradient-to-tr from-red-500 via-orange-500 to-amber-400">
          <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
            <Icon className="w-4 h-4 text-red-300" />
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{alert.hazard_type.toUpperCase()}</div>
          <div className="text-[11px] text-white/60 truncate">{alert.region ?? alert.country ?? ""} · {timeAgo(alert.event_time)}</div>
        </div>
        <button onClick={onClose} className="ml-auto text-white/80" aria-label="Close">
          <X className="w-6 h-6" />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center px-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="max-w-md">
          <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-600/90 text-white text-[10px] font-bold uppercase tracking-wider mb-4">
            <AlertTriangle className="w-3 h-3" /> Live alert
            {alert.severity != null && <span className="ml-1 opacity-80">S{alert.severity}</span>}
          </div>
          <h2 className="text-2xl font-bold leading-tight">{alert.title}</h2>
          {alert.summary && <p className="mt-3 text-white/75 text-sm">{alert.summary}</p>}
          <Link
            to={`/alerts/${alert.id}`}
            className="mt-6 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-black text-sm font-semibold"
          >
            Open full report <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
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
          <div className="font-semibold text-white">{isWarn ? "Broadcast a warning" : "New HOT post"}</div>
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
                const active = kind === k;
                return (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1 transition ${
                      active
                        ? `bg-gradient-to-r ${m.ring} text-white border-transparent`
                        : "bg-white/5 text-white/60 border-white/10"
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
              isWarn ? "bg-gradient-to-r from-red-600 to-orange-500 text-white" : "bg-white text-black hover:bg-white/90"
            } disabled:opacity-50`}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : isWarn ? <AlertTriangle className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            {isWarn ? "Broadcast warning" : "Share"}
          </button>
        </div>
      </div>
    </div>
  );
}