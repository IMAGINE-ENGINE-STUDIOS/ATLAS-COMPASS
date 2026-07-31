import { supabase } from "@/integrations/supabase/client";

/** Credit packs sold in the developer portal. 1 credit = $0.01. */
export interface CreditPack {
  id: string;
  usd: number;
  credits: number;
  bonusPct: number;
  label: string;
  /** Metered membership instead of a prepaid pack. */
  payg?: boolean;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: "starter", usd: 25, credits: 2_500, bonusPct: 0, label: "Starter" },
  { id: "growth", usd: 100, credits: 10_300, bonusPct: 3, label: "Growth", payg: true },
  { id: "scale", usd: 500, credits: 53_500, bonusPct: 7, label: "Scale" },
  { id: "enterprise", usd: 2_000, credits: 224_000, bonusPct: 12, label: "Enterprise" },
];

export const CREDIT_USD = 0.01;

export const creditsToUsd = (credits: number) => credits * CREDIT_USD;

export const fmtUsd = (n: number, digits = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const fmtCredits = (n: number) => n.toLocaleString("en-US");

/** Base URL developers call. */
export const WAVE_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wave-api`;

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 40);
}

export interface WaveAccount {
  id: string;
  owner_id: string;
  company_name: string | null;
  contact_email: string | null;
  balance_credits: number;
  lifetime_purchased_credits: number;
  lifetime_spent_credits: number;
  low_balance_threshold: number;
  auto_topup_enabled: boolean;
  auto_topup_pack: string | null;
  country_allowlist: string[];
  rate_limit_per_second: number;
  rate_limit_per_day: number;
  status: string;
}

/** Fetch the signed-in developer's account, creating it on first visit. */
export async function ensureAccount(): Promise<WaveAccount | null> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return null;

  const { data: existing } = await supabase
    .from("signal_accounts")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (existing) return existing as unknown as WaveAccount;

  const { data: created } = await supabase
    .from("signal_accounts")
    .insert({ owner_id: user.id, contact_email: user.email ?? null })
    .select()
    .single();
  return (created as unknown as WaveAccount) ?? null;
}

export interface CreatedKey {
  id: string;
  plaintext: string;
}

/**
 * Mint an API key. The plaintext is generated locally and shown once — only a
 * SHA-256 hash ever reaches the database.
 */
export async function createApiKey(
  accountId: string,
  ownerId: string,
  name: string,
  mode: "live" | "test",
): Promise<CreatedKey> {
  const prefix = mode === "live" ? "sig_live_" : "sig_test_";
  const plaintext = `${prefix}${randomToken(24)}`;
  const key_hash = await sha256Hex(plaintext);
  const { data, error } = await supabase
    .from("signal_api_keys")
    .insert({
      account_id: accountId,
      owner_id: ownerId,
      name: name.trim() || "Untitled key",
      mode,
      prefix,
      key_hash,
      last_four: plaintext.slice(-4),
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id, plaintext };
}

export function newWebhookSecret(): string {
  return `whsec_${randomToken(24)}`;
}