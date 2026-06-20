import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, UserPlus } from "lucide-react";
import { lookupUsername, sendFriendRequest, type UserLite } from "@/lib/sharing";
import { toast } from "sonner";

interface Props {
  onPick: (u: UserLite) => void;
  selectedId?: string;
  placeholder?: string;
}

export default function UserSearchPicker({ onPick, selectedId, placeholder = "Search username…" }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        setResults(await lookupUsername(q));
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const friend = async (u: UserLite, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await sendFriendRequest(u.id);
      toast.success(`Friend request sent to @${u.username}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to send friend request");
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
        {loading && <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin opacity-60" />}
      </div>
      <div className="max-h-56 overflow-y-auto rounded-md border border-border/60 divide-y divide-border/40">
        {results.length === 0 && q && !loading && (
          <div className="p-3 text-sm text-muted-foreground">No users found</div>
        )}
        {results.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => onPick(u)}
            className={`w-full flex items-center gap-3 p-2 text-left hover:bg-accent/40 transition ${
              selectedId === u.id ? "bg-accent/60" : ""
            }`}
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={u.avatar_url ?? undefined} />
              <AvatarFallback>{(u.username ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{u.display_name ?? u.username}</div>
              <div className="text-xs text-muted-foreground truncate">@{u.username}</div>
            </div>
            <Button size="icon" variant="ghost" onClick={(e) => friend(u, e)} title="Add friend">
              <UserPlus className="h-4 w-4" />
            </Button>
          </button>
        ))}
      </div>
    </div>
  );
}