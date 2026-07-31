import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CREDIT_PACKS, WAVE_BASE_URL, createApiKey, ensureAccount, fmtCredits, fmtUsd,
  newWebhookSecret, type WaveAccount,
} from "@/lib/waveApi";
import { Copy, KeyRound, Loader2, Trash2, Webhook } from "lucide-react";
import waveLogo from "@/assets/wave-logo.png";

interface ApiKeyRow {
  id: string; name: string; mode: string; prefix: string; last_four: string;
  last_used_at: string | null; revoked_at: string | null; paused: boolean; created_at: string;
}
interface TxRow {
  id: string; kind: string; credits: number; balance_after: number;
  note: string | null; created_at: string;
}
interface MsgRow {
  id: string; to_phone: string; country_iso: string | null; segments: number;
  credits_charged: number; status: string; mode: string; created_at: string;
}
interface HookRow {
  id: string; url: string; events: string[]; signing_secret: string; enabled: boolean;
}

const copy = (v: string, label: string) => {
  navigator.clipboard.writeText(v).then(() => toast.success(`${label} copied`));
};

/** WAVE developer portal — keys, credits, logs and webhooks. */
const DevelopersPage = () => {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [account, setAccount] = useState<WaveAccount | null>(null);
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [msgs, setMsgs] = useState<MsgRow[]>([]);
  const [hooks, setHooks] = useState<HookRow[]>([]);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [keyName, setKeyName] = useState("");
  const [keyMode, setKeyMode] = useState<"live" | "test">("test");
  const [hookUrl, setHookUrl] = useState("");
  const [tab, setTab] = useState("keys");
  const [busyPack, setBusyPack] = useState<string | null>(null);
  const [paygBusy, setPaygBusy] = useState(false);
  const [monthlyCap, setMonthlyCap] = useState("250");
  const [perChargeCap, setPerChargeCap] = useState("50");

  const refresh = useCallback(async (accountId: string) => {
    const [k, t, m, w] = await Promise.all([
      supabase.from("signal_api_keys").select("*").eq("account_id", accountId).order("created_at", { ascending: false }),
      supabase.from("signal_credit_transactions").select("*").eq("account_id", accountId).order("created_at", { ascending: false }).limit(100),
      supabase.from("signal_messages").select("*").eq("account_id", accountId).order("created_at", { ascending: false }).limit(100),
      supabase.from("signal_webhooks").select("*").eq("account_id", accountId).order("created_at", { ascending: false }),
    ]);
    setKeys((k.data ?? []) as unknown as ApiKeyRow[]);
    setTxs((t.data ?? []) as unknown as TxRow[]);
    setMsgs((m.data ?? []) as unknown as MsgRow[]);
    setHooks((w.data ?? []) as unknown as HookRow[]);
  }, []);

  useEffect(() => {
    document.title = "Developer portal — ATLAS WAVE API keys & credits";
    document.querySelector('meta[name="description"]')?.setAttribute(
      "content",
      "Create ATLAS WAVE API keys, buy prepaid credits, inspect message logs and configure signed webhooks.",
    );
    (async () => {
      const acc = await ensureAccount();
      setSignedIn(Boolean(acc));
      setAccount(acc);
      if (acc) await refresh(acc.id);
      setLoading(false);
    })();
  }, [refresh]);

  const spend30 = useMemo(
    () => txs.filter((t) => t.kind === "debit").reduce((n, t) => n + Math.abs(Number(t.credits)), 0),
    [txs],
  );
  const delivered = useMemo(
    () => msgs.filter((m) => m.status === "delivered" || m.status === "sent").length,
    [msgs],
  );

  /** A developer has "activated" WAVE once any credit purchase / top-up landed. */
  const hasPurchased = useMemo(
    () => txs.some((t) => ["purchase", "topup", "top_up", "credit"].includes(t.kind) || Number(t.credits) > 0),
    [txs],
  );
  const starterPack = CREDIT_PACKS[0];

  const acc = account as (WaveAccount & Record<string, any>) | null;
  const paygOn = Boolean(acc?.payg_enabled);
  const cardLabel = acc?.payg_card_brand && acc?.payg_card_last4
    ? `${String(acc.payg_card_brand).toUpperCase()} ···· ${acc.payg_card_last4}`
    : null;

  useEffect(() => {
    if (!acc) return;
    if (acc.monthly_spend_cap_usd) setMonthlyCap(String(Number(acc.monthly_spend_cap_usd)));
    if (acc.per_broadcast_cap_usd) setPerChargeCap(String(Number(acc.per_broadcast_cap_usd)));
  }, [acc?.id, acc?.monthly_spend_cap_usd, acc?.per_broadcast_cap_usd]);

  const reloadAccount = useCallback(async () => {
    const fresh = await ensureAccount();
    setAccount(fresh);
    if (fresh) await refresh(fresh.id);
  }, [refresh]);

  const startCheckout = async (body: Record<string, unknown>, done: () => void) => {
    try {
      const { data, error } = await supabase.functions.invoke("wave-create-checkout", { body });
      if (error) throw error;
      if (!data?.url) throw new Error(data?.error ?? "Checkout unavailable");
      window.open(data.url as string, "_blank", "noopener");
      toast.success("Checkout opened in a new tab");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start checkout");
    } finally {
      done();
    }
  };

  const buyPack = (packId: string) => {
    setBusyPack(packId);
    void startCheckout({ mode: "pack", packId }, () => setBusyPack(null));
  };

  const setupPayg = () => {
    setPaygBusy(true);
    void startCheckout(
      {
        mode: "payg",
        monthlySpendCapUsd: Number(monthlyCap) || 250,
        perChargeCapUsd: Number(perChargeCap) || 50,
      },
      () => setPaygBusy(false),
    );
  };

  const openPortal = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("wave-customer-portal", { body: {} });
      if (error) throw error;
      if (!data?.url) throw new Error(data?.error ?? "Portal unavailable");
      window.open(data.url as string, "_blank", "noopener");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open billing portal");
    }
  };

  const saveCaps = async () => {
    if (!account) return;
    await supabase.from("signal_accounts").update({
      monthly_spend_cap_usd: Number(monthlyCap) || 250,
      per_broadcast_cap_usd: Number(perChargeCap) || 50,
    } as never).eq("id", account.id);
    await reloadAccount();
    toast.success("Spend limits saved");
  };

  /** Confirm the Stripe session after the developer returns from checkout. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const flow = params.get("wave_billing");
    if (!flow) return;
    window.history.replaceState({}, "", window.location.pathname);
    if (flow === "cancelled" || !sessionId) {
      if (flow === "cancelled") toast.info("Checkout cancelled");
      return;
    }
    (async () => {
      const { data, error } = await supabase.functions.invoke("wave-verify-checkout", {
        body: { sessionId },
      });
      if (error || data?.error) {
        toast.error("Could not confirm the payment yet — refresh in a moment");
        return;
      }
      if (data.status === "paid") toast.success(`${fmtCredits(Number(data.credits ?? 0))} credits added`);
      else if (data.status === "active") toast.success("Pay-as-you-go activated");
      else toast.info("Payment is still processing");
      await reloadAccount();
      setTab("billing");
    })();
  }, [reloadAccount]);

  const mintKey = async () => {
    if (!account) return;
    try {
      const { plaintext } = await createApiKey(account.id, account.owner_id, keyName, keyMode);
      setFreshKey(plaintext);
      setKeyName("");
      await refresh(account.id);
      toast.success("API key created — copy it now, it will not be shown again");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create key");
    }
  };

  const revokeKey = async (id: string) => {
    await supabase.from("signal_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    if (account) await refresh(account.id);
    toast.success("Key revoked");
  };

  const togglePause = async (row: ApiKeyRow) => {
    await supabase.from("signal_api_keys").update({ paused: !row.paused }).eq("id", row.id);
    if (account) await refresh(account.id);
  };

  const addHook = async () => {
    if (!account || !hookUrl.trim()) return;
    const { error } = await supabase.from("signal_webhooks").insert({
      account_id: account.id, owner_id: account.owner_id,
      url: hookUrl.trim(), signing_secret: newWebhookSecret(),
    });
    if (error) return toast.error(error.message);
    setHookUrl("");
    await refresh(account.id);
    toast.success("Webhook endpoint added");
  };

  const removeHook = async (id: string) => {
    await supabase.from("signal_webhooks").delete().eq("id", id);
    if (account) await refresh(account.id);
  };

  const saveAccount = async (patch: Partial<WaveAccount>) => {
    if (!account) return;
    const { data } = await supabase.from("signal_accounts").update(patch as any)
      .eq("id", account.id).select().single();
    if (data) setAccount(data as unknown as WaveAccount);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <img src={waveLogo} alt="WAVE logo" width={32} height={32} className="h-8 w-8 object-contain" />
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to use the WAVE API</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Developer accounts, API keys and credit balances are tied to your ATLAS account.
        </p>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/pricing">See pricing</Link></Button>
          <Button asChild><Link to="/dashboard">Sign in</Link></Button>
        </div>
      </div>
    );
  }

  const balance = Number(account?.balance_credits ?? 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <img src={waveLogo} alt="WAVE logo" width={24} height={24} className="h-6 w-6 object-contain" loading="lazy" />
          <span className="font-semibold tracking-tight">WAVE developer portal</span>
          <div className="ml-auto flex gap-2">
            <Button asChild variant="ghost" size="sm"><Link to="/pricing">Pricing</Link></Button>
            <Button asChild variant="ghost" size="sm"><Link to="/developers/docs">Docs</Link></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Credit balance", fmtCredits(balance), fmtUsd(balance * 0.01)],
            ["Spent (recent)", fmtCredits(spend30), fmtUsd(spend30 * 0.01)],
            ["Messages logged", fmtCredits(msgs.length), `${delivered} delivered`],
            ["Active keys", String(keys.filter((k) => !k.revoked_at).length), `${hooks.length} webhook(s)`],
          ].map(([label, value, sub]) => (
            <div key={label} className="rounded-xl border border-border/70 bg-card/50 p-5">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
              <div className="mt-1 text-xs text-muted-foreground tabular-nums">{sub}</div>
            </div>
          ))}
        </section>

        {!hasPurchased ? (
          <section className="mt-4 overflow-hidden rounded-xl border border-primary/40 bg-primary/5 p-5 sm:p-6">
            <div className="flex flex-wrap items-start gap-4">
              <img src={waveLogo} alt="" aria-hidden="true" width={36} height={36}
                className="h-9 w-9 object-contain" loading="lazy" />
              <div className="min-w-[240px] flex-1">
                <h2 className="text-lg font-semibold tracking-tight">
                  Activate WAVE with the {starterPack.label} package
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Your account is live in test mode: mint test keys and run the full API for free — test sends are
                  simulated and never charged. To deliver real messages to real phones you need credits. WAVE is
                  prepaid and pay-as-you-go: no monthly fee, no contract, credits never expire.
                </p>
                <ul className="mt-3 grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
                  <li>· 1 credit = $0.01 — priced per segment and destination country</li>
                  <li>· {starterPack.label}: {fmtUsd(starterPack.usd, 0)} → {fmtCredits(starterPack.credits)} credits</li>
                  <li>· Live keys, delivery logs and signed webhooks unlock instantly</li>
                  <li>· Larger packages add up to +12% bonus credits</li>
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" disabled={busyPack === starterPack.id}
                    onClick={() => buyPack(starterPack.id)}>
                    {busyPack === starterPack.id && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    Start with {starterPack.label} · {fmtUsd(starterPack.usd, 0)}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setTab("billing")}>
                    Or pay as you go
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setTab("credits")}>
                    Compare packages
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/developers/docs">Read the docs first</Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>
        ) : balance < Number(account?.low_balance_threshold ?? 0) && (
          <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
            Your balance is below your low-balance threshold. Live sends will stop at zero credits.
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab} className="mt-8">
          <TabsList className="flex-wrap">
            <TabsTrigger value="keys">API keys</TabsTrigger>
            <TabsTrigger value="credits">Credits</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* ---------------- keys ---------------- */}
          <TabsContent value="keys" className="mt-6 space-y-6">
            <div className="rounded-xl border border-border/70 bg-card/40 p-5">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[200px] flex-1">
                  <Label htmlFor="keyname">Key name</Label>
                  <Input id="keyname" value={keyName} onChange={(e) => setKeyName(e.target.value)}
                    placeholder="Production server" className="mt-1.5" />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Switch id="livemode" checked={keyMode === "live"}
                    onCheckedChange={(v) => setKeyMode(v ? "live" : "test")} />
                  <Label htmlFor="livemode">{keyMode === "live" ? "Live key" : "Test key"}</Label>
                </div>
                <Button onClick={mintKey}><KeyRound className="mr-2 h-4 w-4" />Create key</Button>
              </div>
              {freshKey && (
                <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 p-4">
                  <div className="text-xs uppercase tracking-widest text-primary">Copy this now</div>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 break-all text-sm">{freshKey}</code>
                    <Button size="icon" variant="ghost" onClick={() => copy(freshKey, "API key")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    We only store a hash — this value can never be shown again.
                  </p>
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-border/70">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="px-4 py-3 text-left font-medium">Key</th>
                    <th className="px-4 py-3 text-left font-medium">Last used</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-3">
                        {k.name}
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {k.mode}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {k.prefix}••••{k.last_four}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {k.revoked_at ? (
                          <span className="text-xs text-muted-foreground">revoked</span>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => togglePause(k)}>
                              {k.paused ? "Resume" : "Pause"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => revokeKey(k.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {keys.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                      No keys yet. Create a test key to start.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-border/70 bg-card/40 p-5">
              <div className="text-sm font-medium">Your base URL</div>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 break-all text-xs text-muted-foreground">{WAVE_BASE_URL}</code>
                <Button size="icon" variant="ghost" onClick={() => copy(WAVE_BASE_URL, "Base URL")}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ---------------- credits ---------------- */}
          <TabsContent value="credits" className="mt-6 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {CREDIT_PACKS.map((p) => (
                <div key={p.id} className="rounded-xl border border-border/70 bg-card/50 p-5">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">{p.label}</div>
                  <div className="mt-2 text-2xl font-semibold tabular-nums">{fmtUsd(p.usd, 0)}</div>
                  <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {fmtCredits(p.credits)} credits{p.bonusPct ? ` · +${p.bonusPct}%` : ""}
                  </div>
                  <Button className="mt-4 w-full" size="sm" disabled={busyPack === p.id}
                    onClick={() => buyPack(p.id)}>
                    {busyPack === p.id && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    Buy credits
                  </Button>
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded-xl border border-border/70">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">When</th>
                    <th className="px-4 py-3 text-left font-medium">Type</th>
                    <th className="px-4 py-3 text-left font-medium">Detail</th>
                    <th className="px-4 py-3 text-right font-medium">Credits</th>
                    <th className="px-4 py-3 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => (
                    <tr key={t.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5">{t.kind}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{t.note ?? "—"}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${Number(t.credits) < 0 ? "text-destructive" : "text-emerald-400"}`}>
                        {Number(t.credits) > 0 ? "+" : ""}{fmtCredits(Number(t.credits))}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {fmtCredits(Number(t.balance_after))}
                      </td>
                    </tr>
                  ))}
                  {txs.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                      No transactions yet.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ---------------- logs ---------------- */}
          <TabsContent value="billing" className="mt-6 space-y-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-card/50 p-5">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Membership</div>
                <h3 className="mt-2 text-lg font-semibold tracking-tight">
                  {paygOn ? "Pay as you go — active" : "Pay as you go"}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Connect a card or bank account once. We charge only what you consume — no monthly fee — and stop
                  automatically at the limits you set below. Credits are topped up on demand when a send needs them.
                </p>
                <ul className="mt-3 grid gap-1.5 text-sm text-muted-foreground">
                  <li>· 1 credit = $0.01, billed per segment and destination country</li>
                  <li>· Automatic top-up the moment a send exceeds your balance</li>
                  <li>· Hard monthly and per-charge ceilings you control</li>
                  <li>· Every charge itemised in the transaction ledger</li>
                </ul>
                {cardLabel && (
                  <div className="mt-4 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-sm tabular-nums">
                    Card on file · {cardLabel}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" onClick={setupPayg} disabled={paygBusy}>
                    {paygBusy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    {paygOn ? "Replace payment method" : "Connect payment method"}
                  </Button>
                  {paygOn && (
                    <Button size="sm" variant="outline" onClick={openPortal}>
                      Manage billing
                    </Button>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-card/50 p-5">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Your spend limits</div>
                <div className="mt-4 space-y-4">
                  <div>
                    <Label htmlFor="monthlycap">Monthly spend cap (USD)</Label>
                    <Input id="monthlycap" type="number" min={1} step={1} value={monthlyCap}
                      onChange={(e) => setMonthlyCap(e.target.value)} className="mt-1.5" />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Sends pause once month-to-date charges reach this amount.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="chargecap">Per-charge cap (USD)</Label>
                    <Input id="chargecap" type="number" min={1} step={1} value={perChargeCap}
                      onChange={(e) => setPerChargeCap(e.target.value)} className="mt-1.5" />
                    <p className="mt-1 text-xs text-muted-foreground">
                      No single automatic top-up will exceed this amount.
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-sm tabular-nums text-muted-foreground">
                    Charged this month: {fmtUsd(Number(acc?.month_spend_usd ?? 0))} of{" "}
                    {fmtUsd(Number(acc?.monthly_spend_cap_usd ?? monthlyCap))}
                  </div>
                  <Button size="sm" variant="outline" onClick={saveCaps}>Save limits</Button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-card/40 p-5 text-sm text-muted-foreground">
              Prefer to prepay? Buy a credit package in the{" "}
              <button className="underline" onClick={() => setTab("credits")}>Credits</button> tab — packages never
              expire and larger ones include bonus credits.
            </div>
          </TabsContent>

          <TabsContent value="logs" className="mt-6">
            <div className="overflow-hidden rounded-xl border border-border/70">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">When</th>
                    <th className="px-4 py-3 text-left font-medium">To</th>
                    <th className="px-4 py-3 text-left font-medium">Country</th>
                    <th className="px-4 py-3 text-right font-medium">Segments</th>
                    <th className="px-4 py-3 text-right font-medium">Credits</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {msgs.map((m) => (
                    <tr key={m.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {new Date(m.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">{m.to_phone}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{m.country_iso ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{m.segments}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtCredits(Number(m.credits_charged))}</td>
                      <td className="px-4 py-2.5">
                        <span className="rounded bg-muted px-2 py-0.5 text-xs">{m.status}</span>
                        {m.mode === "test" && (
                          <span className="ml-2 text-[11px] text-muted-foreground">test</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {msgs.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                      No messages sent yet.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ---------------- webhooks ---------------- */}
          <TabsContent value="webhooks" className="mt-6 space-y-6">
            <div className="rounded-xl border border-border/70 bg-card/40 p-5">
              <Label htmlFor="hookurl">Endpoint URL</Label>
              <div className="mt-1.5 flex gap-2">
                <Input id="hookurl" value={hookUrl} onChange={(e) => setHookUrl(e.target.value)}
                  placeholder="https://yourapp.com/hooks/wave" />
                <Button onClick={addHook}><Webhook className="mr-2 h-4 w-4" />Add</Button>
              </div>
            </div>
            <div className="space-y-3">
              {hooks.map((h) => (
                <div key={h.id} className="rounded-xl border border-border/70 bg-card/40 p-5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{h.url}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{h.events.join(", ")}</div>
                      <div className="mt-3 flex items-center gap-2">
                        <code className="truncate text-xs text-muted-foreground">{h.signing_secret}</code>
                        <Button size="icon" variant="ghost" onClick={() => copy(h.signing_secret, "Signing secret")}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => removeHook(h.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {hooks.length === 0 && (
                <p className="text-sm text-muted-foreground">No endpoints configured.</p>
              )}
            </div>
          </TabsContent>

          {/* ---------------- settings ---------------- */}
          <TabsContent value="settings" className="mt-6 space-y-6">
            <div className="rounded-xl border border-border/70 bg-card/40 p-5 space-y-5">
              <div>
                <Label htmlFor="company">Company name</Label>
                <Input id="company" defaultValue={account?.company_name ?? ""} className="mt-1.5"
                  onBlur={(e) => saveAccount({ company_name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="threshold">Low-balance alert threshold (credits)</Label>
                <Input id="threshold" type="number" defaultValue={account?.low_balance_threshold ?? 500}
                  className="mt-1.5"
                  onBlur={(e) => saveAccount({ low_balance_threshold: Number(e.target.value) })} />
              </div>
              <div>
                <Label htmlFor="allow">Country allowlist (ISO codes, comma separated — empty allows all priced countries)</Label>
                <Input id="allow" defaultValue={(account?.country_allowlist ?? []).join(", ")} className="mt-1.5"
                  onBlur={(e) => saveAccount({
                    country_allowlist: e.target.value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
                  })} />
              </div>
              <div className="flex items-center gap-3">
                <Switch id="topup" checked={Boolean(account?.auto_topup_enabled)}
                  onCheckedChange={(v) => saveAccount({ auto_topup_enabled: v })} />
                <Label htmlFor="topup">Auto top-up when balance falls below the threshold</Label>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                Rate limits: {account?.rate_limit_per_second}/second · {account?.rate_limit_per_day}/day.
                Contact us to raise them.
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default DevelopersPage;