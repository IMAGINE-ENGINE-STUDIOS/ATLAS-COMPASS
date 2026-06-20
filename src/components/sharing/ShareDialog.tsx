import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, Clock, Flame, Users } from "lucide-react";
import { toast } from "sonner";
import {
  listFrequentRecipients,
  listRecentRecipients,
  listFriendships,
  sendShare,
  type RecipientStat,
  type UserLite,
  type FriendshipRow,
} from "@/lib/sharing";
import UserSearchPicker from "./UserSearchPicker";
import type { FileLike } from "@/components/shared/FileContextMenu";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  file: FileLike | null;
}

export default function ShareDialog({ open, onOpenChange, file }: Props) {
  const [picked, setPicked] = useState<UserLite | null>(null);
  const [note, setNote] = useState("");
  const [recent, setRecent] = useState<RecipientStat[]>([]);
  const [frequent, setFrequent] = useState<RecipientStat[]>([]);
  const [friends, setFriends] = useState<FriendshipRow[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPicked(null);
    setNote("");
    (async () => {
      const [r, f, fr] = await Promise.all([
        listRecentRecipients(),
        listFrequentRecipients(),
        listFriendships(),
      ]);
      setRecent(r);
      setFrequent(f);
      setFriends(fr.filter((x) => x.status === "accepted"));
    })();
  }, [open]);

  const submit = async () => {
    if (!picked || !file) return;
    setSending(true);
    try {
      await sendShare({
        recipientId: picked.id,
        kind: file.kind,
        name: file.name,
        payload: file.payload,
        sourceTable: file.sourceTable,
        sourceId: file.sourceId,
        thumbnailUrl: file.thumbnailUrl,
        note: note.trim() || undefined,
      });
      toast.success(`Sent "${file.name}" to @${picked.username}`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const userRow = (u: UserLite) => (
    <button
      key={u.id}
      type="button"
      onClick={() => setPicked(u)}
      className={`w-full flex items-center gap-3 p-2 rounded-md text-left hover:bg-accent/40 transition ${
        picked?.id === u.id ? "bg-accent/60" : ""
      }`}
    >
      <Avatar className="h-7 w-7">
        <AvatarImage src={u.avatar_url ?? undefined} />
        <AvatarFallback>{(u.username ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{u.display_name ?? u.username}</div>
        <div className="text-xs text-muted-foreground truncate">@{u.username}</div>
      </div>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share {file ? `"${file.name}"` : "file"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="search" className="w-full">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="search">Search</TabsTrigger>
            <TabsTrigger value="recent"><Clock className="h-3 w-3 mr-1" />Recent</TabsTrigger>
            <TabsTrigger value="frequent"><Flame className="h-3 w-3 mr-1" />Frequent</TabsTrigger>
            <TabsTrigger value="friends"><Users className="h-3 w-3 mr-1" />Friends</TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="mt-3">
            <UserSearchPicker onPick={setPicked} selectedId={picked?.id} />
          </TabsContent>
          <TabsContent value="recent" className="mt-3 max-h-60 overflow-y-auto">
            {recent.length === 0 && <p className="text-sm text-muted-foreground p-2">No recent recipients yet.</p>}
            {recent.map((r) => r.profile && userRow(r.profile))}
          </TabsContent>
          <TabsContent value="frequent" className="mt-3 max-h-60 overflow-y-auto">
            {frequent.length === 0 && <p className="text-sm text-muted-foreground p-2">You haven't shared with anyone yet.</p>}
            {frequent.map((r) => r.profile && userRow(r.profile))}
          </TabsContent>
          <TabsContent value="friends" className="mt-3 max-h-60 overflow-y-auto">
            {friends.length === 0 && <p className="text-sm text-muted-foreground p-2">Add friends to send faster.</p>}
            {friends.map((f) => f.other && userRow(f.other))}
          </TabsContent>
        </Tabs>

        {picked && (
          <div className="mt-2 p-2 rounded-md bg-muted/40 text-sm">
            Sending to <span className="font-medium">@{picked.username}</span>
          </div>
        )}

        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note (optional)"
          rows={3}
        />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!picked || sending}>
            <Send className="h-4 w-4 mr-2" />
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}