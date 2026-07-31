import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CREDIT_PACKS, fmtCredits, fmtUsd } from "@/lib/waveApi";
import { ArrowLeft, Search, Signal } from "lucide-react";

interface RateRow {
  country_iso: string;
  country_name: string;
  channel: string;
  sell_usd_per_segment: number;
}

const CHANNEL_LABEL: Record<string, string> = {
  sms_outbound: "Outbound message",
  sms_inbound: "Inbound message",
  alert_broadcast_recipient: "Alert broadcast (per recipient)",
  number_rental_monthly: "Dedicated number (per month)",
};

/** Public rate card for the WAVE Network. */
const WavePricingPage = () => {
  const [rates, setRates] = useState<RateRow[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    document.title = "WAVE pricing — per-country message rates";
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        "Transparent prepaid pricing for the WAVE messaging and hazard-alert API. Published per-country rates, no monthly minimum, no contracts.",
      );
    supabase
      .from("signal_pricing_rates")
      .select("country_iso, country_name, channel, sell_usd_per_segment")
      .order("country_name")
      .then(({ data }) => setRates((data ?? []) as unknown as RateRow[]));
  }, []);

  const outbound = useMemo(
    () =>
      rates
        .filter((r) => r.channel === "sms_outbound")
        .filter((r) =>
          query.trim()
            ? r.country_name.toLowerCase().includes(query.trim().toLowerCase()) ||
              r.country_iso.toLowerCase() === query.trim().toLowerCase()
            : true,
        ),
    [rates, query],
  );

  const other = useMemo(() => rates.filter((r) => r.channel !== "sms_outbound"), [rates]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <Button asChild variant="ghost" size="icon">
            <Link to="/" aria-label="Back to ATLAS"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <Signal className="h-5 w-5 text-primary" />
          <span className="font-semibold tracking-tight">WAVE</span>
          <div className="ml-auto flex gap-2">
            <Button asChild variant="ghost" size="sm"><Link to="/developers/docs">Docs</Link></Button>
            <Button asChild size="sm"><Link to="/developers">Get API keys</Link></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Pay only for what you send
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Buy credits up front, spend them per message. No subscription, no minimum, no invoices.
          One credit is $0.01 and every destination has a published price below.
        </p>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CREDIT_PACKS.map((p) => (
            <div key={p.id} className="rounded-xl border border-border/70 bg-card/60 p-5 backdrop-blur">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">{p.label}</div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">{fmtUsd(p.usd, 0)}</div>
              <div className="mt-1 text-sm text-muted-foreground tabular-nums">
                {fmtCredits(p.credits)} credits
              </div>
              {p.bonusPct > 0 && (
                <div className="mt-3 inline-flex rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                  +{p.bonusPct}% bonus credits
                </div>
              )}
            </div>
          ))}
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight">Other billable events</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-border/70">
            <table className="w-full text-sm">
              <tbody>
                {other.map((r) => (
                  <tr key={r.channel} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3">{CHANNEL_LABEL[r.channel] ?? r.channel}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmtUsd(Number(r.sell_usd_per_segment), r.channel === "number_rental_monthly" ? 2 : 3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-12">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight">Per-country message rates</h2>
            <div className="relative ml-auto w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a country"
                className="pl-9"
              />
            </div>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Prices are per message segment (160 GSM-7 characters, or 70 for Unicode).
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Country</th>
                  <th className="px-4 py-3 text-right font-medium">Per segment</th>
                  <th className="px-4 py-3 text-right font-medium">Credits</th>
                </tr>
              </thead>
              <tbody>
                {outbound.map((r) => (
                  <tr key={r.country_iso} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="text-muted-foreground tabular-nums">{r.country_iso}</span>
                      <span className="ml-3">{r.country_name}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {fmtUsd(Number(r.sell_usd_per_segment), 3)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {Math.ceil(Number(r.sell_usd_per_segment) / 0.01)}
                    </td>
                  </tr>
                ))}
                {outbound.length === 0 && (
                  <tr><td className="px-4 py-6 text-center text-muted-foreground" colSpan={3}>No match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Destination not listed? Contact us and we will publish a rate for it.
          </p>
        </section>
      </main>
    </div>
  );
};

export default WavePricingPage;