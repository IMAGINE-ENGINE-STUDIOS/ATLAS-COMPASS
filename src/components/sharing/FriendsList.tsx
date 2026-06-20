import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Check, X, UserMinus } from "lucide-react";
import { listFriendships, respondFriendRequest, removeFriendship, type FriendshipRow } from "@/lib/sharing";
import UserSearchPicker from "./UserSearchPicker";
import { toast } from "sonner";

export default function FriendsList() {
  const [rows, setRows] = useState<FriendshipRow[]>([]);

  const refresh = async () => setRows(await listFriendships());
  useEffect(() => {
    refresh();
  }, []);

  const pending = rows.filter((r) => r.status === "pending" && r.incoming);
  const outgoing = rows.filter((r) => r.status === "pending" && !r.incoming);
  const friends = rows.filter((r) => r.status === "accepted");

  const respond = async (id: string, accept: boolean) => {
    try {
      await respondFriendRequest(id, accept);
      toast.success(accept ? "Friend added" : "Request declined");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  const remove = async (id: string) => {
    await removeFriendship(id);
    refresh();
  };

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-medium mb-2">Add friend</h3>
        <UserSearchPicker onPick={() => toast.info("Use + icon to send request")} />
      </section>

      {pending.length > 0 && (
        <section>
          <h3 className="text-sm font-medium mb-2">Pending requests</h3>
          <div className="space-y-1">
            {pending.map((r) => (
              <div key={r.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={r.other?.avatar_url ?? undefined} />
                  <AvatarFallback>{(r.other?.username ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{r.other?.display_name ?? r.other?.username}</div>
                  <div className="text-xs text-muted-foreground truncate">@{r.other?.username}</div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => respond(r.id, true)}><Check className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => respond(r.id, false)}><X className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {outgoing.length > 0 && (
        <section>
          <h3 className="text-sm font-medium mb-2">Sent</h3>
          <div className="space-y-1">
            {outgoing.map((r) => (
              <div key={r.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/20 text-sm">
                @{r.other?.username} — pending
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => remove(r.id)}>Cancel</Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="text-sm font-medium mb-2">Friends ({friends.length})</h3>
        {friends.length === 0 && <p className="text-sm text-muted-foreground">No friends yet.</p>}
        <div className="space-y-1">
          {friends.map((r) => (
            <div key={r.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
              <Avatar className="h-7 w-7">
                <AvatarImage src={r.other?.avatar_url ?? undefined} />
                <AvatarFallback>{(r.other?.username ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{r.other?.display_name ?? r.other?.username}</div>
                <div className="text-xs text-muted-foreground truncate">@{r.other?.username}</div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(r.id)} title="Remove">
                <UserMinus className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}