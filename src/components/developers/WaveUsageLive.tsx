import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { creditsToUsd, fmtCredits, fmtUsd } from "@/lib/waveApi";


interface OrderRow {
  id: string;
  kind: string;
  status: string;
  usd_amount: number;
  credits: number;
  pack_id: string | null;
  note: string | null;
  created_at: string;
}

interface LiveAccount {
  balance_credits: number;
  month_spend_usd: number | null;
  monthly_spend_cap_usd: number | null;
  per_broadcast_cap_usd: number | null;
  payg_enabled: boolean | null;
  payg_card_brand: string | null;
  payg_card_last4: string | null;
}

const startOfMonthIso = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
};

const Meter = ({ pct, warn }: { pct: number; warn: boolean }) => (
  <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
    <div
      className={`h-full rounded-full transition-all duration-500 ${warn ? "bg-destructive" : "bg-primary"}`}
      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
    />
  </div>
);

const Stat = ({
  label, value, sub, pct, warn,
}: {
  label: string; value: string; sub?: string;
  pct?: number; warn?: boolean;
}) => (
  <div className="rounded-3xl border border-border/40 bg-card/30 p-6 backdrop-blur-2xl">
    <div className="text-base font-medium text-muted-foreground">{label}</div>
    <div className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">{value}</div>
    {sub && <div className="mt-2 text-base text-muted-foreground tabular-nums">{sub}</div>}
    {typeof pct === "number" && <Meter pct={pct} warn={Boolean(warn)} />}
  </div>
);

/**
 * Live pay-as-you-go usage: month-to-date metered spend, remaining limits and
 * every metered charge, streamed over realtime as charges land.
 */
const WaveUsageLive = ({ accountId }: { accountId: string }) => {
  const [live, setLive] = useState<LiveAccount | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [monthCredits, setMonthCredits] = useState(0);
  const [pulse, setPulse] = useState(false);

  const load = useCallback(async () => {
    const since = startOfMonthIso();
    const [a, o, t] = await Promise.all([
      supabase
        .from("signal_accounts")
        .select("balance_credits, month_spend_usd, monthly_spend_cap_usd, per_broadcast_cap_usd, payg_enabled, payg_card_brand, payg_card_last4")
        .eq("id", accountId)
        .maybeSingle(),
      supabase
        .from("wave_orders")
        .select("id, kind, status, usd_amount, credits, pack_id, note, created_at")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("signal_credit_transactions")
        .select("credits")
        .eq("account_id", accountId)
        .lt("credits", 0)
        .gte("created_at", since)
        .limit(1000),
    ]);
    if (a.data) setLive(a.data as unknown as LiveAccount);
    setOrders((o.data ?? []) as unknown as OrderRow[]);
    setMonthCredits(
      ((t.data ?? []) as { credits: number }[]).reduce((n, r) => n + Math.abs(Number(r.credits)), 0),
    );
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Stream account, order and ledger changes so the numbers move as sends happen.
  useEffect(() => {
    if (!accountId) return;
    const bump = () => {
      setPulse(true);
      window.setTimeout(() => setPulse(false), 1200);
      void load();
    };
    const channel = supabase
      .channel(`wave-usage-${accountId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "signal_accounts", filter: `id=eq.${accountId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "wave_orders", filter: `account_id=eq.${accountId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "signal_credit_transactions", filter: `account_id=eq.${accountId}` }, bump)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [accountId, load]);

  const monthlyCap = Number(live?.monthly_spend_cap_usd ?? 0);
  const spent = Number(live?.month_spend_usd ?? 0);
  const remaining = Math.max(0, monthlyCap - spent);
  const capPct = monthlyCap > 0 ? (spent / monthlyCap) * 100 : 0;
  const meteredUsd = useMemo(() => creditsToUsd(monthCredits), [monthCredits]);
  const balanceUsd = useMemo(() => creditsToUsd(Number(live?.balance_credits ?? 0)), [live?.balance_credits]);

  return (
    <section className="space-y-4" aria-label="Live pay-as-you-go usage">
      <div className="flex items-center gap-3 text-base text-muted-foreground">
        <span className={`h-2.5 w-2.5 rounded-full bg-primary ${pulse ? "animate-ping" : ""}`} />
        Live usage · updates as charges land
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Month to date"
          value={fmtUsd(spent)}
          sub={monthlyCap > 0 ? `of ${fmtUsd(monthlyCap)} cap` : "no monthly cap set"}
          pct={capPct}
          warn={capPct >= 80}
        />
        <Stat
          label="Remaining limit"
          value={monthlyCap > 0 ? fmtUsd(remaining) : "—"}
          sub={monthlyCap > 0 ? `${Math.max(0, 100 - Math.round(capPct))}% of your cap left` : "sends never auto-pause"}
        />
        <Stat
          label="Metered this month"
          value={fmtUsd(meteredUsd)}
          sub={`${fmtCredits(monthCredits)} credits consumed`}
        />
        <Stat
          label="Balance"
          value={fmtCredits(Number(live?.balance_credits ?? 0))}
          sub={`${fmtUsd(balanceUsd)} · per-charge cap ${fmtUsd(Number(live?.per_broadcast_cap_usd ?? 0))}`}
        />
      </div>

      <div className="overflow-hidden rounded-3xl border border-border/40 bg-card/30 backdrop-blur-2xl">
        <table className="w-full text-base">
          <thead className="border-b border-border/40 text-base text-muted-foreground">
            <tr>
              <th className="px-6 py-4 text-left font-medium">When</th>
              <th className="px-6 py-4 text-left font-medium">Charge</th>
              <th className="px-6 py-4 text-right font-medium">Amount</th>
              <th className="px-6 py-4 text-right font-medium">Credits</th>
              <th className="px-6 py-4 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-border/50 last:border-0">
                <td className="px-6 py-4 text-muted-foreground">
                  {new Date(o.created_at).toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  {o.kind === "pack" ? `Credit package${o.pack_id ? ` · ${o.pack_id}` : ""}` : "Metered top-up"}
                  {o.note && <span className="ml-3 text-muted-foreground">{o.note}</span>}
                </td>
                <td className="px-6 py-4 text-right tabular-nums">{fmtUsd(Number(o.usd_amount))}</td>
                <td className="px-6 py-4 text-right tabular-nums">{fmtCredits(Number(o.credits))}</td>
                <td className="px-6 py-4">
                  <span className="rounded-full bg-muted px-3 py-1">{o.status}</span>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                  No metered charges yet — they appear here the moment one is billed.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default WaveUsageLive;