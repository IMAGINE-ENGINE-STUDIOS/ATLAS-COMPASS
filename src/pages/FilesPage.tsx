import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Inbox, Send, Files as FilesIcon, Users, Gamepad2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { listShares, updateShareStatus, type FileShareRow } from "@/lib/sharing";
import { supabase } from "@/integrations/supabase/client";
import FriendsList from "@/components/sharing/FriendsList";
import MatchmakingPanel from "@/components/matchmaking/MatchmakingPanel";
import FileContextMenu from "@/components/shared/FileContextMenu";
import ShareDialog from "@/components/sharing/ShareDialog";
import { toast } from "sonner";
import type { FileLike } from "@/components/shared/FileContextMenu";

export default function FilesPage() {
  const [inbox, setInbox] = useState<FileShareRow[]>([]);
  const [sent, setSent] = useState<FileShareRow[]>([]);
  const [shareTarget, setShareTarget] = useState<FileLike | null>(null);

  const refresh = async () => {
    const [i, s] = await Promise.all([listShares("inbox"), listShares("sent")]);
    setInbox(i);
    setSent(s);
  };

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("file_shares-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "file_shares" }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const accept = async (r: FileShareRow) => {
    await updateShareStatus(r.id, "accepted");
    toast.success(`Accepted "${r.name}"`);
    refresh();
  };
  const decline = async (r: FileShareRow) => {
    await updateShareStatus(r.id, "declined");
    refresh();
  };

  const row = (r: FileShareRow, direction: "inbox" | "sent") => {
    const file: FileLike = {
      kind: (r.kind as any) ?? "generic",
      name: r.name,
      payload: r.payload,
      sourceId: r.id,
      sourceTable: "file_shares",
      thumbnailUrl: r.thumbnail_url ?? undefined,
    };
    return (
      <FileContextMenu
        key={r.id}
        file={file}
        onShare={(f) => setShareTarget(f)}
      >
        <div className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-card/50 hover:bg-card/80 transition">
          <Avatar className="h-9 w-9">
            <AvatarImage src={r.other_profile?.avatar_url ?? undefined} />
            <AvatarFallback>{(r.other_profile?.username ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{r.name}</span>
              <Badge variant="outline" className="text-[10px]">{r.kind}</Badge>
              <Badge
                variant={r.status === "pending" ? "default" : r.status === "accepted" ? "secondary" : "destructive"}
                className="text-[10px]"
              >
                {r.status}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {direction === "inbox" ? "from" : "to"} @{r.other_profile?.username ?? "unknown"}
              {r.note ? ` · "${r.note}"` : ""}
            </div>
          </div>
          {direction === "inbox" && r.status === "pending" && (
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => accept(r)}><Check className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => decline(r)}><X className="h-4 w-4" /></Button>
            </div>
          )}
        </div>
      </FileContextMenu>
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <FilesIcon className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Files</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4">
        <Tabs defaultValue="inbox" className="w-full">
          <TabsList>
            <TabsTrigger value="inbox"><Inbox className="h-4 w-4 mr-2" />Inbox {inbox.filter(i => i.status === 'pending').length > 0 && <Badge className="ml-2">{inbox.filter(i => i.status === 'pending').length}</Badge>}</TabsTrigger>
            <TabsTrigger value="sent"><Send className="h-4 w-4 mr-2" />Sent</TabsTrigger>
            <TabsTrigger value="friends"><Users className="h-4 w-4 mr-2" />Friends</TabsTrigger>
            <TabsTrigger value="play"><Gamepad2 className="h-4 w-4 mr-2" />Matchmaking</TabsTrigger>
          </TabsList>

          <TabsContent value="inbox" className="mt-4 space-y-2">
            {inbox.length === 0 && <p className="text-sm text-muted-foreground">Nothing shared with you yet.</p>}
            {inbox.map((r) => row(r, "inbox"))}
          </TabsContent>

          <TabsContent value="sent" className="mt-4 space-y-2">
            {sent.length === 0 && <p className="text-sm text-muted-foreground">You haven't shared anything yet.</p>}
            {sent.map((r) => row(r, "sent"))}
          </TabsContent>

          <TabsContent value="friends" className="mt-4">
            <FriendsList />
          </TabsContent>

          <TabsContent value="play" className="mt-4">
            <MatchmakingPanel />
          </TabsContent>
        </Tabs>
      </main>

      <ShareDialog open={!!shareTarget} onOpenChange={(v) => !v && setShareTarget(null)} file={shareTarget} />
    </div>
  );
}