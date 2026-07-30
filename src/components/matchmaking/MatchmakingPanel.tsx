import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Play, Square, Trophy } from "lucide-react";
import { joinQueue, leaveQueue, subscribeMyMatches, type MatchRow } from "@/lib/matchmaking";
import { toast } from "sonner";

const MODES = ["1v1", "2v2", "4v4", "coop", "race"];
const REGIONS = ["global", "na", "eu", "asia", "sa", "oce"];

export default function MatchmakingPanel() {
  const [mode, setMode] = useState("1v1");
  const [region, setRegion] = useState("global");
  const [skill, setSkill] = useState(1000);
  const [partySize, setPartySize] = useState(2);
  const [queued, setQueued] = useState(false);
  const [match, setMatch] = useState<MatchRow | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const off = subscribeMyMatches((m) => {
      setMatch(m);
      setQueued(false);
      toast.success(`Match found! Room ${m.room_channel}`);
    });
    return off;
  }, []);

  useEffect(() => {
    if (!queued) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [queued]);

  const join = async () => {
    try {
      await joinQueue({ mode, region, skill, partySize });
      setMatch(null);
      setQueued(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to queue");
    }
  };
  const leave = async () => {
    await leaveQueue();
    setQueued(false);
  };

  return (
    <div className="space-y-4 max-w-md">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Mode</label>
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Region</label>
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{REGIONS.map((r) => <SelectItem key={r} value={r}>{r.toUpperCase()}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Skill</label>
          <Input type="number" value={skill} onChange={(e) => setSkill(parseInt(e.target.value || "0", 10))} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Party size</label>
          <Input type="number" min={2} max={16} value={partySize} onChange={(e) => setPartySize(parseInt(e.target.value || "2", 10))} />
        </div>
      </div>

      {!queued ? (
        <Button onClick={join} className="w-full"><Play className="h-4 w-4 mr-2" />Find match</Button>
      ) : (
        <Button variant="destructive" onClick={leave} className="w-full">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Searching… {elapsed}s — cancel
        </Button>
      )}

      {match && (
        <div className="rounded-md border border-border/60 p-3 bg-muted/30">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Trophy className="h-4 w-4" />
            Match {match.id.slice(0, 8)} — {match.mode}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Room channel: <code>{match.room_channel}</code>
          </div>
          <div className="text-xs text-muted-foreground">Players: {match.player_ids.length}</div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Backed by managed Postgres + Realtime fan-out, which handles very high concurrency without managing
        pods or container orchestration.
      </p>
    </div>
  );
}