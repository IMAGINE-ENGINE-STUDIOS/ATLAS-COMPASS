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
import { Loader2 } from "lucide-react";
import waveLogo from "@/assets/wave-logo.png";
import WaveUsageLive from "@/components/developers/WaveUsageLive";

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

/** Shared glass surface — one look across the whole portal. */
const GLASS = "rounded-3xl border border-border/40 bg-card/30 backdrop-blur-2xl";

const Panel = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`${GLASS} p-7 ${className}`}>{children}</div>
);

const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <Panel>
    <div className="text-base font-medium text-muted-foreground">{label}</div>
    <div className="mt-3 text-4xl font-semibold tabular-nums tracking-tight">{value}</div>
    {sub && <div className="mt-2 text-base text-muted-foreground tabular-nums">{sub}</div>}
  </Panel>
);

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
  const [monthlyCap, setMonthlyCap] = useState("100");
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
      "Create ATLAS WAVE API keys, start pay-as-you-go billing, inspect message logs and configure signed webhooks.",
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
  const paygPack = CREDIT_PACKS.find((p) => p.payg) ?? CREDIT_PACKS[1];

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
      // Make sure a billing account exists before Stripe is asked for a session.
      if (!account) {
        const fresh = await ensureAccount();
        if (!fresh) throw new Error("Sign in to purchase credits");
        setAccount(fresh);
      }
      const { data, error } = await supabase.functions.invoke("wave-create-checkout", { body });
      if (error) throw error;
      if (!data?.url) throw new Error(data?.error ?? "Checkout unavailable");
      window.location.assign(data.url as string);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start checkout");
      done();
    }
  };

  const setupPayg = (capUsd?: number) => {
    setPaygBusy(true);
    void startCheckout(
      {
        mode: "payg",
        monthlySpendCapUsd: capUsd ?? (Number(monthlyCap) || 100),
        perChargeCapUsd: Number(perChargeCap) || 50,
      },
      () => setPaygBusy(false),
    );
  };

  const buyPack = (packId: string) => {
    const pack = CREDIT_PACKS.find((p) => p.id === packId);
    // The $100 tier is the metered membership: it connects a card instead of prepaying.
    if (pack?.payg) return setupPayg(pack.usd);
    setBusyPack(packId);
    void startCheckout({ mode: "pack", packId }, () => setBusyPack(null));
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
      monthly_spend_cap_usd: Number(monthlyCap) || 100,
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
      const pending = toast.loading("Confirming your payment…");
      let result: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data, error } = await supabase.functions.invoke("wave-verify-checkout", {
          body: { sessionId },
        });
        if (!error && data && !data.error) {
          result = data;
          if (data.status === "paid" || data.status === "active") break;
        }
        await new Promise((r) => window.setTimeout(r, 1500));
      }
      toast.dismiss(pending);
      if (!result) {
        toast.error("Could not confirm the payment yet — refresh in a moment");
        return;
      }
      if (result.status === "paid") {
        toast.success(`${fmtCredits(Number(result.credits ?? 0))} credits added`);
        setTab("credits");
      } else if (result.status === "active") {
        toast.success("Pay as you go activated");
        setTab("billing");
      } else {
        toast.info("Payment is still processing — your credits will appear shortly");
        setTab("billing");
      }
      await reloadAccount();
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
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center">
        <div className="pointer-events-none absolute inset-0 opacity-70">
          <div className="absolute left-1/4 top-1/4 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute right-1/4 bottom-1/4 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        </div>
        <Panel className="relative z-10 max-w-lg">
          <img src={waveLogo} alt="WAVE logo" width={44} height={44} className="mx-auto h-11 w-11 object-contain" />
          <h1 className="mt-5 text-3xl font-semibold tracking-tight">Sign in to use the WAVE API</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Developer accounts, API keys and billing are tied to your ATLAS account.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button asChild variant="outline" size="lg"><Link to="/pricing">See pricing</Link></Button>
            <Button asChild size="lg"><Link to="/dashboard">Sign in</Link></Button>
          </div>
        </Panel>
      </div>
    );
  }

  const balance = Number(account?.balance_credits ?? 0);
  const cellHead = "px-6 py-4 text-left text-base font-medium text-muted-foreground";
  const cell = "px-6 py-4 text-base";

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* Ambient light behind the glass */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-24 top-0 h-[28rem] w-[28rem] rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-[24rem] w-[24rem] rounded-full bg-accent/15 blur-3xl" />
      </div>

      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/50 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-5">
          <img src={waveLogo} alt="WAVE logo" width={32} height={32} className="h-8 w-8 object-contain" loading="lazy" />
          <span className="text-xl font-semibold tracking-tight">WAVE</span>
          <div className="ml-auto flex gap-2">
            <Button asChild variant="ghost"><Link to="/pricing">Pricing</Link></Button>
            <Button asChild variant="ghost"><Link to="/developers/docs">Docs</Link></Button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 py-10">
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Credit balance" value={fmtCredits(balance)} sub={fmtUsd(balance * 0.01)} />
          <Stat label="Spent recently" value={fmtCredits(spend30)} sub={fmtUsd(spend30 * 0.01)} />
          <Stat label="Messages logged" value={fmtCredits(msgs.length)} sub={`${delivered} delivered`} />
          <Stat
            label="Active keys"
            value={String(keys.filter((k) => !k.revoked_at).length)}
            sub={`${hooks.length} webhook endpoints`}
          />
        </section>

        {!hasPurchased ? (
          <Panel className="mt-5 border-primary/30 bg-primary/10">
            <h2 className="text-3xl font-semibold tracking-tight">Start pay as you go</h2>
            <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
              Your account is live in test mode — mint test keys and run the full API for free. To reach real phones,
              connect a card once and we charge only what you send, up to the {fmtUsd(paygPack.usd, 0)} monthly ceiling
              you can change any time.
            </p>
            <ul className="mt-5 grid gap-3 text-lg text-muted-foreground sm:grid-cols-2">
              <li>1 credit = $0.01, per segment and destination</li>
              <li>No monthly fee, no contract, no commitment</li>
              <li>Live keys, delivery logs and signed webhooks</li>
              <li>Hard monthly and per-charge limits you control</li>
            </ul>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button size="lg" disabled={paygBusy} onClick={() => setupPayg(paygPack.usd)}>
                {paygBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Start pay as you go · {fmtUsd(paygPack.usd, 0)} / month cap
              </Button>
              <Button size="lg" variant="outline" onClick={() => setTab("credits")}>
                Prepay instead
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link to="/developers/docs">Read the docs</Link>
              </Button>
            </div>
          </Panel>
        ) : balance < Number(account?.low_balance_threshold ?? 0) && (
          <Panel className="mt-5 border-destructive/40 bg-destructive/10">
            <p className="text-lg">
              Your balance is below your low-balance threshold. Live sends stop at zero credits.
            </p>
          </Panel>
        )}

        <Tabs value={tab} onValueChange={setTab} className="mt-10">
          <TabsList className={`h-auto flex-wrap gap-1 border border-border/40 bg-card/30 p-1.5 backdrop-blur-2xl`}>
            <TabsTrigger className="rounded-full px-5 py-2 text-base" value="keys">Keys</TabsTrigger>
            <TabsTrigger className="rounded-full px-5 py-2 text-base" value="credits">Credits</TabsTrigger>
            <TabsTrigger className="rounded-full px-5 py-2 text-base" value="billing">Billing</TabsTrigger>
            <TabsTrigger className="rounded-full px-5 py-2 text-base" value="logs">Logs</TabsTrigger>
            <TabsTrigger className="rounded-full px-5 py-2 text-base" value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger className="rounded-full px-5 py-2 text-base" value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* ---------------- keys ---------------- */}
          <TabsContent value="keys" className="mt-7 space-y-6">
            <Panel>
              <div className="flex flex-wrap items-end gap-4">
                <div className="min-w-[240px] flex-1">
                  <Label htmlFor="keyname" className="text-base">Key name</Label>
                  <Input id="keyname" value={keyName} onChange={(e) => setKeyName(e.target.value)}
                    placeholder="Production server" className="mt-2 h-12 rounded-2xl bg-background/40 text-base" />
                </div>
                <div className="flex items-center gap-3 pb-3">
                  <Switch id="livemode" checked={keyMode === "live"}
                    onCheckedChange={(v) => setKeyMode(v ? "live" : "test")} />
                  <Label htmlFor="livemode" className="text-base">
                    {keyMode === "live" ? "Live key" : "Test key"}
                  </Label>
                </div>
                <Button size="lg" onClick={mintKey}>Create key</Button>
              </div>
              {freshKey && (
                <div className="mt-6 rounded-2xl border border-primary/40 bg-primary/10 p-5">
                  <div className="text-base font-medium text-primary">Copy this now</div>
                  <div className="mt-3 flex items-center gap-3">
                    <code className="flex-1 break-all text-base">{freshKey}</code>
                    <Button variant="outline" onClick={() => copy(freshKey, "API key")}>Copy</Button>
                  </div>
                  <p className="mt-3 text-base text-muted-foreground">
                    We only store a hash — this value can never be shown again.
                  </p>
                </div>
              )}
            </Panel>

            <div className={`${GLASS} overflow-hidden`}>
              <table className="w-full">
                <thead className="border-b border-border/40">
                  <tr>
                    <th className={cellHead}>Name</th>
                    <th className={cellHead}>Key</th>
                    <th className={cellHead}>Last used</th>
                    <th className={`${cellHead} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id} className="border-b border-border/30 last:border-0">
                      <td className={cell}>
                        {k.name}
                        <span className="ml-3 rounded-full bg-muted px-3 py-1 text-base text-muted-foreground">
                          {k.mode}
                        </span>
                      </td>
                      <td className={`${cell} font-mono text-muted-foreground`}>
                        {k.prefix}••••{k.last_four}
                      </td>
                      <td className={`${cell} text-muted-foreground`}>
                        {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}
                      </td>
                      <td className={`${cell} text-right`}>
                        {k.revoked_at ? (
                          <span className="text-muted-foreground">revoked</span>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => togglePause(k)}>
                              {k.paused ? "Resume" : "Pause"}
                            </Button>
                            <Button variant="ghost" onClick={() => revokeKey(k.id)}>Revoke</Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {keys.length === 0 && (
                    <tr><td colSpan={4} className="px-6 py-8 text-center text-base text-muted-foreground">
                      No keys yet. Create a test key to start.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <Panel>
              <div className="text-base font-medium">Your base URL</div>
              <div className="mt-3 flex items-center gap-3">
                <code className="flex-1 break-all text-base text-muted-foreground">{WAVE_BASE_URL}</code>
                <Button variant="outline" onClick={() => copy(WAVE_BASE_URL, "Base URL")}>Copy</Button>
              </div>
            </Panel>
          </TabsContent>

          {/* ---------------- credits ---------------- */}
          <TabsContent value="credits" className="mt-7 space-y-6">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {CREDIT_PACKS.map((p) => (
                <Panel key={p.id} className={p.payg ? "border-primary/40 bg-primary/10" : ""}>
                  <div className="text-base font-medium text-muted-foreground">
                    {p.payg ? "Pay as you go" : p.label}
                  </div>
                  <div className="mt-3 text-4xl font-semibold tabular-nums tracking-tight">
                    {fmtUsd(p.usd, 0)}
                  </div>
                  <div className="mt-2 text-base text-muted-foreground tabular-nums">
                    {p.payg
                      ? "monthly cap · billed as you send"
                      : `${fmtCredits(p.credits)} credits${p.bonusPct ? ` · +${p.bonusPct}%` : ""}`}
                  </div>
                  <Button
                    className="mt-6 w-full"
                    size="lg"
                    variant={p.payg ? "default" : "outline"}
                    disabled={p.payg ? paygBusy : busyPack === p.id}
                    onClick={() => buyPack(p.id)}
                  >
                    {(p.payg ? paygBusy : busyPack === p.id) && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {p.payg ? (paygOn ? "Manage card" : "Connect card") : "Buy credits"}
                  </Button>
                </Panel>
              ))}
            </div>

            <div className={`${GLASS} overflow-hidden`}>
              <table className="w-full">
                <thead className="border-b border-border/40">
                  <tr>
                    <th className={cellHead}>When</th>
                    <th className={cellHead}>Type</th>
                    <th className={cellHead}>Detail</th>
                    <th className={`${cellHead} text-right`}>Credits</th>
                    <th className={`${cellHead} text-right`}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => (
                    <tr key={t.id} className="border-b border-border/30 last:border-0">
                      <td className={`${cell} text-muted-foreground`}>
                        {new Date(t.created_at).toLocaleString()}
                      </td>
                      <td className={cell}>{t.kind}</td>
                      <td className={`${cell} text-muted-foreground`}>{t.note ?? "—"}</td>
                      <td className={`${cell} text-right tabular-nums ${Number(t.credits) < 0 ? "text-destructive" : "text-success"}`}>
                        {Number(t.credits) > 0 ? "+" : ""}{fmtCredits(Number(t.credits))}
                      </td>
                      <td className={`${cell} text-right tabular-nums text-muted-foreground`}>
                        {fmtCredits(Number(t.balance_after))}
                      </td>
                    </tr>
                  ))}
                  {txs.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-base text-muted-foreground">
                      No transactions yet.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ---------------- billing ---------------- */}
          <TabsContent value="billing" className="mt-7 space-y-6">
            {account && <WaveUsageLive accountId={account.id} />}
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel>
                <div className="text-base font-medium text-muted-foreground">Membership</div>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight">
                  {paygOn ? "Pay as you go — active" : `Pay as you go · ${fmtUsd(paygPack.usd, 0)} monthly cap`}
                </h3>
                <p className="mt-3 text-lg text-muted-foreground">
                  Connect a card or bank account once. We charge only what you consume, with no monthly fee, and stop
                  automatically at the limits you set.
                </p>
                <ul className="mt-5 grid gap-3 text-lg text-muted-foreground">
                  <li>1 credit = $0.01, per segment and destination</li>
                  <li>Automatic top-up the moment a send needs it</li>
                  <li>Hard monthly and per-charge ceilings</li>
                  <li>Every charge itemised in the ledger</li>
                </ul>
                {cardLabel && (
                  <div className="mt-5 rounded-2xl border border-border/40 bg-background/40 px-4 py-3 text-lg tabular-nums">
                    Card on file · {cardLabel}
                  </div>
                )}
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button size="lg" onClick={() => setupPayg()} disabled={paygBusy}>
                    {paygBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {paygOn ? "Replace payment method" : "Connect payment method"}
                  </Button>
                  {paygOn && (
                    <Button size="lg" variant="outline" onClick={openPortal}>Manage billing</Button>
                  )}
                </div>
              </Panel>

              <Panel>
                <div className="text-base font-medium text-muted-foreground">Your spend limits</div>
                <div className="mt-5 space-y-6">
                  <div>
                    <Label htmlFor="monthlycap" className="text-base">Monthly spend cap in dollars</Label>
                    <Input id="monthlycap" type="number" min={1} step={1} value={monthlyCap}
                      onChange={(e) => setMonthlyCap(e.target.value)}
                      className="mt-2 h-12 rounded-2xl bg-background/40 text-base" />
                    <p className="mt-2 text-base text-muted-foreground">
                      Sends pause once month-to-date charges reach this amount.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="chargecap" className="text-base">Per-charge cap in dollars</Label>
                    <Input id="chargecap" type="number" min={1} step={1} value={perChargeCap}
                      onChange={(e) => setPerChargeCap(e.target.value)}
                      className="mt-2 h-12 rounded-2xl bg-background/40 text-base" />
                    <p className="mt-2 text-base text-muted-foreground">
                      No single automatic top-up exceeds this amount.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/40 bg-background/40 px-4 py-3 text-lg tabular-nums text-muted-foreground">
                    Charged this month: {fmtUsd(Number(acc?.month_spend_usd ?? 0))} of{" "}
                    {fmtUsd(Number(acc?.monthly_spend_cap_usd ?? monthlyCap))}
                  </div>
                  <Button size="lg" variant="outline" onClick={saveCaps}>Save limits</Button>
                </div>
              </Panel>
            </div>

            <Panel>
              <p className="text-lg text-muted-foreground">
                Prefer to prepay? Buy a credit package in the{" "}
                <button className="underline" onClick={() => setTab("credits")}>Credits</button> tab — packages never
                expire and larger ones include bonus credits.
              </p>
            </Panel>
          </TabsContent>

          {/* ---------------- logs ---------------- */}
          <TabsContent value="logs" className="mt-7">
            <div className={`${GLASS} overflow-hidden`}>
              <table className="w-full">
                <thead className="border-b border-border/40">
                  <tr>
                    <th className={cellHead}>When</th>
                    <th className={cellHead}>To</th>
                    <th className={cellHead}>Country</th>
                    <th className={`${cellHead} text-right`}>Segments</th>
                    <th className={`${cellHead} text-right`}>Credits</th>
                    <th className={cellHead}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {msgs.map((m) => (
                    <tr key={m.id} className="border-b border-border/30 last:border-0">
                      <td className={`${cell} text-muted-foreground`}>
                        {new Date(m.created_at).toLocaleString()}
                      </td>
                      <td className={`${cell} font-mono`}>{m.to_phone}</td>
                      <td className={`${cell} text-muted-foreground`}>{m.country_iso ?? "—"}</td>
                      <td className={`${cell} text-right tabular-nums`}>{m.segments}</td>
                      <td className={`${cell} text-right tabular-nums`}>{fmtCredits(Number(m.credits_charged))}</td>
                      <td className={cell}>
                        <span className="rounded-full bg-muted px-3 py-1 text-base">{m.status}</span>
                        {m.mode === "test" && (
                          <span className="ml-3 text-base text-muted-foreground">test</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {msgs.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-base text-muted-foreground">
                      No messages sent yet.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ---------------- webhooks ---------------- */}
          <TabsContent value="webhooks" className="mt-7 space-y-6">
            <Panel>
              <Label htmlFor="hookurl" className="text-base">Endpoint URL</Label>
              <div className="mt-2 flex flex-wrap gap-3">
                <Input id="hookurl" value={hookUrl} onChange={(e) => setHookUrl(e.target.value)}
                  placeholder="https://yourapp.com/hooks/wave"
                  className="h-12 min-w-[260px] flex-1 rounded-2xl bg-background/40 text-base" />
                <Button size="lg" onClick={addHook}>Add endpoint</Button>
              </div>
            </Panel>
            <div className="space-y-4">
              {hooks.map((h) => (
                <Panel key={h.id}>
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg">{h.url}</div>
                      <div className="mt-2 text-base text-muted-foreground">{h.events.join(", ")}</div>
                      <div className="mt-4 flex items-center gap-3">
                        <code className="truncate text-base text-muted-foreground">{h.signing_secret}</code>
                        <Button variant="outline" onClick={() => copy(h.signing_secret, "Signing secret")}>
                          Copy
                        </Button>
                      </div>
                    </div>
                    <Button variant="ghost" onClick={() => removeHook(h.id)}>Remove</Button>
                  </div>
                </Panel>
              ))}
              {hooks.length === 0 && (
                <p className="text-lg text-muted-foreground">No endpoints configured.</p>
              )}
            </div>
          </TabsContent>

          {/* ---------------- settings ---------------- */}
          <TabsContent value="settings" className="mt-7 space-y-6">
            <Panel className="space-y-6">
              <div>
                <Label htmlFor="company" className="text-base">Company name</Label>
                <Input id="company" defaultValue={account?.company_name ?? ""}
                  className="mt-2 h-12 rounded-2xl bg-background/40 text-base"
                  onBlur={(e) => saveAccount({ company_name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="threshold" className="text-base">Low-balance alert threshold in credits</Label>
                <Input id="threshold" type="number" defaultValue={account?.low_balance_threshold ?? 500}
                  className="mt-2 h-12 rounded-2xl bg-background/40 text-base"
                  onBlur={(e) => saveAccount({ low_balance_threshold: Number(e.target.value) })} />
              </div>
              <div>
                <Label htmlFor="allow" className="text-base">
                  Country allowlist — ISO codes, comma separated. Empty allows all priced countries.
                </Label>
                <Input id="allow" defaultValue={(account?.country_allowlist ?? []).join(", ")}
                  className="mt-2 h-12 rounded-2xl bg-background/40 text-base"
                  onBlur={(e) => saveAccount({
                    country_allowlist: e.target.value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
                  })} />
              </div>
              <div className="flex items-center gap-4">
                <Switch id="topup" checked={Boolean(account?.auto_topup_enabled)}
                  onCheckedChange={(v) => saveAccount({ auto_topup_enabled: v })} />
                <Label htmlFor="topup" className="text-base">
                  Auto top-up when balance falls below the threshold
                </Label>
              </div>
              <p className="text-base text-muted-foreground tabular-nums">
                Rate limits: {account?.rate_limit_per_second} per second · {account?.rate_limit_per_day} per day.
                Contact us to raise them.
              </p>
            </Panel>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default DevelopersPage;
