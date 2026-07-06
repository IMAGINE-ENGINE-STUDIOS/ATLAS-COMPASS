/**
 * NotificationsBell — top-right badge that subscribes to tile_intel_events
 * via Supabase Realtime and shows a rolling list of the last 20 alarms.
 * Clicking an unread event marks it read; clicking the bell opens the drawer.
 */
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface EventRow {
  id: string; rule_id: string; fired_at: string; sample: Record<string, unknown>; read_at: string | null;
}

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const unread = events.filter((e) => !e.read_at).length;

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.from("tile_intel_events").select("id,rule_id,fired_at,sample,read_at").order("fired_at", { ascending: false }).limit(20);
      if (mounted) setEvents((data ?? []) as unknown as EventRow[]);
    })();
    const channel = supabase.channel("tile_intel_events_rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tile_intel_events" }, (payload) => {
        const row = payload.new as unknown as EventRow;
        setEvents((prev) => [row, ...prev].slice(0, 20));
        toast.info("New alarm", { description: JSON.stringify(row.sample).slice(0, 120) });
      })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, []);

  const markAll = async () => {
    const ids = events.filter((e) => !e.read_at).map((e) => e.id);
    if (!ids.length) return;
    await supabase.from("tile_intel_events").update({ read_at: new Date().toISOString() }).in("id", ids);
    setEvents((prev) => prev.map((e) => ({ ...e, read_at: e.read_at ?? new Date().toISOString() })));
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="relative p-2 rounded-full bg-black/40 backdrop-blur border border-white/10 hover:bg-black/60" title="Alarms">
        <Bell className="w-4 h-4 text-white" />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-[9px] font-bold text-white flex items-center justify-center">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 max-h-80 overflow-auto rounded-xl bg-black/70 backdrop-blur-xl border border-white/10 text-white text-[11px] p-2 z-[80]">
          <div className="flex items-center justify-between px-1 pb-1">
            <div className="font-semibold">Alarms</div>
            <button onClick={markAll} className="text-[10px] text-sky-300 hover:underline">Mark all read</button>
          </div>
          {events.length === 0 && <div className="text-white/50 px-1 py-4 text-center">No alarms yet.</div>}
          <ul className="space-y-1">
            {events.map((e) => (
              <li key={e.id} className={`rounded px-2 py-1.5 border border-white/5 ${e.read_at ? "bg-white/[0.02]" : "bg-sky-500/10"}`}>
                <div className="text-[10px] text-white/50">{new Date(e.fired_at).toLocaleString()}</div>
                <div className="truncate">{JSON.stringify(e.sample)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}