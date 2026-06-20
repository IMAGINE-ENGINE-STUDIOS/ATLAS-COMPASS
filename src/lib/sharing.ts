import { supabase } from "@/integrations/supabase/client";

export interface UserLite {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface ShareInput {
  recipientId: string;
  kind: string;
  name: string;
  payload: unknown;
  sourceTable?: string;
  sourceId?: string;
  thumbnailUrl?: string;
  note?: string;
}

export async function lookupUsername(q: string): Promise<UserLite[]> {
  const query = q.trim();
  if (!query) return [];
  const { data, error } = await supabase.rpc("lookup_user_by_username", { _q: query });
  if (error) {
    console.warn("[sharing] lookup error", error.message);
    return [];
  }
  return (data ?? []) as UserLite[];
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function sendShare(input: ShareInput): Promise<string | null> {
  const { data, error } = await supabase.rpc("record_share", {
    _recipient: input.recipientId,
    _kind: input.kind,
    _name: input.name,
    _payload: (input.payload ?? {}) as any,
    _source_table: input.sourceTable ?? null,
    _source_id: input.sourceId ?? null,
    _thumbnail_url: input.thumbnailUrl ?? null,
    _note: input.note ?? null,
  });
  if (error) {
    console.warn("[sharing] send error", error.message);
    throw error;
  }
  return (data as string) ?? null;
}

export interface RecipientStat {
  recipient_id: string;
  share_count: number;
  last_shared_at: string;
  profile: UserLite | null;
}

export async function listRecentRecipients(limit = 12): Promise<RecipientStat[]> {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("share_recipients_stats")
    .select("recipient_id, share_count, last_shared_at")
    .order("last_shared_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return hydrateRecipients(data as any);
}

export async function listFrequentRecipients(limit = 12): Promise<RecipientStat[]> {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("share_recipients_stats")
    .select("recipient_id, share_count, last_shared_at")
    .order("share_count", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return hydrateRecipients(data as any);
}

async function hydrateRecipients(rows: Array<Omit<RecipientStat, "profile">>): Promise<RecipientStat[]> {
  const ids = rows.map((r) => r.recipient_id);
  if (ids.length === 0) return [];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", ids);
  const byId = new Map<string, UserLite>();
  (profiles ?? []).forEach((p: any) => byId.set(p.id, p));
  return rows.map((r) => ({ ...r, profile: byId.get(r.recipient_id) ?? null }));
}

/* ---------------- friendships ---------------- */

export interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "blocked";
  other: UserLite | null;
  incoming: boolean;
}

export async function listFriendships(): Promise<FriendshipRow[]> {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const { data } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .order("updated_at", { ascending: false });
  const rows = (data ?? []) as any[];
  const otherIds = rows.map((r) => (r.requester_id === uid ? r.addressee_id : r.requester_id));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", otherIds);
  const byId = new Map<string, UserLite>();
  (profiles ?? []).forEach((p: any) => byId.set(p.id, p));
  return rows.map((r) => {
    const otherId = r.requester_id === uid ? r.addressee_id : r.requester_id;
    return {
      id: r.id,
      requester_id: r.requester_id,
      addressee_id: r.addressee_id,
      status: r.status,
      other: byId.get(otherId) ?? null,
      incoming: r.addressee_id === uid,
    };
  });
}

export async function sendFriendRequest(addresseeId: string) {
  const uid = await getCurrentUserId();
  if (!uid) throw new Error("Sign in to add friends");
  if (uid === addresseeId) throw new Error("Cannot friend yourself");
  const { error } = await supabase
    .from("friendships")
    .insert({ requester_id: uid, addressee_id: addresseeId, status: "pending" });
  if (error && !error.message.includes("duplicate")) throw error;
}

export async function respondFriendRequest(id: string, accept: boolean) {
  const { error } = await supabase
    .from("friendships")
    .update({ status: accept ? "accepted" : "blocked" })
    .eq("id", id);
  if (error) throw error;
}

export async function removeFriendship(id: string) {
  await supabase.from("friendships").delete().eq("id", id);
}

/* ---------------- file_shares browsing ---------------- */

export interface FileShareRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  kind: string;
  name: string;
  note: string | null;
  thumbnail_url: string | null;
  payload: any;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  other_profile: UserLite | null;
}

export async function listShares(direction: "inbox" | "sent"): Promise<FileShareRow[]> {
  const uid = await getCurrentUserId();
  if (!uid) return [];
  const filter = direction === "inbox" ? "recipient_id" : "sender_id";
  const { data } = await supabase
    .from("file_shares")
    .select("*")
    .eq(filter, uid)
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as any[];
  const otherIds = rows.map((r) => (direction === "inbox" ? r.sender_id : r.recipient_id));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", otherIds);
  const byId = new Map<string, UserLite>();
  (profiles ?? []).forEach((p: any) => byId.set(p.id, p));
  return rows.map((r) => ({
    ...r,
    other_profile: byId.get(direction === "inbox" ? r.sender_id : r.recipient_id) ?? null,
  }));
}

export async function updateShareStatus(id: string, status: "accepted" | "declined") {
  await supabase
    .from("file_shares")
    .update({ status, read_at: new Date().toISOString() })
    .eq("id", id);
}