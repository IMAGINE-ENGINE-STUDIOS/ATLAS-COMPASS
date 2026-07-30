import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtCredits, fmtUsd } from "@/lib/signalApi";
import { Loader2, Signal, TrendingUp } from "lucide-react";

interface UsageRow { credits_spent: number; cost_usd: number; revenue_usd: number; day: string; account_id: string }
interface AccountRow {
  id: string; company_name: string | null; contact_email: string | null;
  balance_credits: number; lifetime_spent_credits: number; status: string;
}
interface RateRow {
  id: string; country_iso: string; country_name: string; channel: string;
  cost_usd_per_segment: number; sell_usd_per_segment: number;
}

/** Admin-only view of the resale business: revenue, cost, margin and rate card. */
const SignalRevenueSection = () => {
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [multiplier, setMultiplier] = useState(2);
  const [floor, setFloor] = useState(0.02);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const [u, a, r, c] = await Promise.all([
      supabase.from("signal_usage_daily").select("day, account_id, credits_spent, cost_usd, revenue_usd").gte("day", since),
      supabase.from("signal_accounts").select("id, company_name, contact_email, balance_credits, lifetime_spent_credits, status"),
      supabase.from("signal_pricing_rates").select("*").order("country_name"),
      supabase.from("signal_pricing_config").select("*").eq("id", 1).maybeSingle(),
    ]);
    setUsage((u.data ?? []) as unknown as UsageRow[]);
    setAccounts((a.data ?? []) as unknown as AccountRow[]);
    setRates((r.data ?? []) as unknown as RateRow[]);
    if (c.data) {
      setMultiplier(Number(c.data.markup_multiplier));
      setFloor(Number(c.data.floor_usd_per_segment));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const revenue = usage.reduce((n, u) => n + Number(u.revenue_usd), 0);
    const cost = usage.reduce((n, u) => n + Number(u.cost_usd), 0);
    const liability = accounts.reduce((n, a) => n + Number(a.balance_credits), 0) * 0.01;
    return {
      revenue, cost, margin: revenue - cost,
      marginPct: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
      liability,
    };
  }, [usage, accounts]);

  const topAccounts = useMemo(() => {
    const byAccount = new Map<string, number>();
    for (const u of usage) byAccount.set(u.account_id, (byAccount.get(u.account_id) ?? 0) + Number(u.revenue_usd));
    return [...byAccount.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([id, rev]) => ({ rev, acc: accounts.find((a) => a.id === id) }));
  }, [usage, accounts]);

  const outliers = useMemo(
    () => rates
      .filter((r) => r.channel === "sms_outbound")
      .map((r) => ({
        ...r,
        marginPct: Number(r.sell_usd_per_segment) > 0
          ? ((Number(r.sell_usd_per_segment) - Number(r.cost_usd_per_segment)) / Number(r.sell_usd_per_segment)) * 100
          : 0,
      }))
      .sort((a, b) => a.marginPct - b.marginPct)
      .slice(0, 6),
    [rates],
  );

  const applyMarkup = async () => {
    setSaving(true);
    const { error: cfgErr } = await supabase
      .from("signal_pricing_config")
      .update({ markup_multiplier: multiplier, floor_usd_per_segment: floor })
      .eq("id", 1);
    if (cfgErr) { setSaving(false); return toast.error(cfgErr.message); }

    for (const r of rates) {
      const sell = Math.max(
        Math.ceil(Number(r.cost_usd_per_segment) * multiplier * 1000) / 1000,
        r.channel === "number_rental_monthly" ? 0 : floor,
      );
      await supabase.from("signal_pricing_rates").update({ sell_usd_per_segment: sell }).eq("id", r.id);
    }
    await load();
    setSaving(false);
    toast.success("Rate card recomputed");
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/70 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Signal revenue…
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Signal className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold tracking-tight">Signal revenue</h2>
        <Button asChild variant="ghost" size="sm" className="ml-auto">
          <Link to="/developers">Open developer portal</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Gross revenue (30d)", fmtUsd(totals.revenue)],
          ["Landed cost (30d)", fmtUsd(totals.cost)],
          ["Realized margin", fmtUsd(totals.margin)],
          ["Margin %", `${totals.marginPct.toFixed(1)}%`],
          ["Unspent credit liability", fmtUsd(totals.liability)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border/70 bg-card/50 p-4">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
            <div className="mt-2 text-xl font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-border/70 bg-card/40 p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <TrendingUp className="h-4 w-4" /> Top accounts (30d)
          </div>
          <div className="mt-3 space-y-2">
            {topAccounts.map(({ acc, rev }, i) => (
              <div key={acc?.id ?? i} className="flex items-center justify-between text-sm">
                <span className="truncate text-muted-foreground">
                  {acc?.company_name || acc?.contact_email || "Unnamed account"}
                </span>
                <span className="tabular-nums">{fmtUsd(rev)}</span>
              </div>
            ))}
            {topAccounts.length === 0 && (
              <p className="text-sm text-muted-foreground">No usage recorded yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card/40 p-5">
          <div className="text-sm font-medium">Thinnest margins</div>
          <div className="mt-3 space-y-2">
            {outliers.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span className="truncate text-muted-foreground">{r.country_name}</span>
                <span className="tabular-nums">
                  {fmtUsd(Number(r.sell_usd_per_segment), 3)} · {r.marginPct.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="text-sm font-medium">Rate card controls</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Sell price = landed cost × multiplier, rounded up to a tenth of a cent, never below the floor.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="mult">Markup multiplier</Label>
            <Input id="mult" type="number" step="0.1" value={multiplier} className="mt-1.5 w-32"
              onChange={(e) => setMultiplier(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="floor">Floor (USD / segment)</Label>
            <Input id="floor" type="number" step="0.001" value={floor} className="mt-1.5 w-32"
              onChange={(e) => setFloor(Number(e.target.value))} />
          </div>
          <Button onClick={applyMarkup} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Recompute {rates.length} rates
          </Button>
        </div>
      </div>
    </section>
  );
};

export default SignalRevenueSection;