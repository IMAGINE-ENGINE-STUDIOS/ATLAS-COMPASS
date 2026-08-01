import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CREDIT_PACKS, ensureAccount, fmtCredits, fmtUsd, type WaveAccount } from "@/lib/waveApi";
import { Loader2 } from "lucide-react";
import waveLogo from "@/assets/wave-logo.png";

const GLASS = "rounded-3xl border border-border/40 bg-card/30 backdrop-blur-2xl";
const FIELD = "mt-2 h-12 rounded-2xl bg-background/40 text-base";

const Row = ({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) => (
  <div className="flex items-baseline justify-between gap-6 py-3">
    <span className={strong ? "text-lg" : "text-lg text-muted-foreground"}>{label}</span>
    <span className={`tabular-nums ${strong ? "text-2xl font-semibold" : "text-lg"}`}>{value}</span>
  </div>
);

/** Dedicated WAVE checkout screen. Confirms the order, then hands off to Stripe. */
const WaveCheckoutPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const payg = params.get("mode") === "payg";
  const pack = useMemo(
    () => CREDIT_PACKS.find((p) => p.id === params.get("pack")) ?? null,
    [params],
  );
  const paygPack = CREDIT_PACKS.find((p) => p.payg) ?? CREDIT_PACKS[1];

  const [account, setAccount] = useState<WaveAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [monthlyCap, setMonthlyCap] = useState(String(paygPack.usd));
  const [perChargeCap, setPerChargeCap] = useState("25");

  const title = payg ? "Pay as you go" : pack ? `${pack.label} credit pack` : "Checkout";

  useEffect(() => {
    document.title = `${title} — WAVE checkout`;
    document.querySelector('meta[name="description"]')?.setAttribute(
      "content",
      "Review your WAVE order and pay securely with Stripe — credits and pay-as-you-go activate instantly.",
    );
  }, [title]);

  useEffect(() => {
    (async () => {
      const acc = await ensureAccount();
      setAccount(acc);
      const a = acc as (WaveAccount & Record<string, any>) | null;
      if (a?.contact_email) setEmail(a.contact_email);
      if (a?.monthly_spend_cap_usd) setMonthlyCap(String(Number(a.monthly_spend_cap_usd)));
      if (a?.per_broadcast_cap_usd) setPerChargeCap(String(Number(a.per_broadcast_cap_usd)));
      setLoading(false);
    })();
  }, []);

  const pay = async () => {
    if (!payg && !pack) return;
    setBusy(true);
    try {
      if (!account) {
        const fresh = await ensureAccount();
        if (!fresh) throw new Error("Sign in to continue");
        setAccount(fresh);
      }
      const body = payg
        ? {
            mode: "payg",
            email: email.trim() || undefined,
            monthlySpendCapUsd: Number(monthlyCap) || paygPack.usd,
            perChargeCapUsd: Number(perChargeCap) || 25,
          }
        : { mode: "pack", packId: pack!.id, email: email.trim() || undefined };
      const { data, error } = await supabase.functions.invoke("wave-create-checkout", { body });
      if (error) throw error;
      if (!data?.url) throw new Error(data?.error ?? "Checkout unavailable");
      window.location.assign(data.url as string);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start checkout");
      setBusy(false);
    }
  };

  const usd = payg ? Number(monthlyCap) || paygPack.usd : pack?.usd ?? 0;

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-24 top-0 h-[28rem] w-[28rem] rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-[24rem] w-[24rem] rounded-full bg-accent/15 blur-3xl" />
      </div>

      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/50 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-5">
          <img src={waveLogo} alt="WAVE logo" width={32} height={32} className="h-8 w-8 object-contain" />
          <span className="text-xl font-semibold tracking-tight">WAVE</span>
          <Button asChild variant="ghost" className="ml-auto"><Link to="/developers">Back to portal</Link></Button>
        </div>
      </header>

      <main className="relative mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          {payg
            ? "Connect a card once. We charge only what you send, never past the limits you set here."
            : "Credits never expire and are spent per message segment and destination."}
        </p>

        {loading ? (
          <div className={`${GLASS} mt-8 flex items-center gap-3 p-7 text-lg text-muted-foreground`}>
            <Loader2 className="h-5 w-5 animate-spin" /> Preparing your order…
          </div>
        ) : !payg && !pack ? (
          <div className={`${GLASS} mt-8 p-7`}>
            <p className="text-lg">Pick a plan to continue.</p>
            <Button className="mt-6" size="lg" onClick={() => navigate("/developers")}>Choose a plan</Button>
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            <div className={`${GLASS} p-7`}>
              <div className="text-base font-medium text-muted-foreground">Order summary</div>
              <div className="mt-4 divide-y divide-border/40">
                <Row label={payg ? "Metered membership" : `${pack!.label} pack`} value={fmtUsd(usd, 0)} />
                {payg ? (
                  <Row label="Charged" value="Only what you send" />
                ) : (
                  <Row
                    label="Credits included"
                    value={`${fmtCredits(pack!.credits)}${pack!.bonusPct ? ` · +${pack!.bonusPct}%` : ""}`}
                  />
                )}
                <Row label="Credit rate" value="$0.01 per credit" />
                <Row label={payg ? "Monthly ceiling" : "Total due today"} value={fmtUsd(usd, 2)} strong />
              </div>
            </div>

            <div className={`${GLASS} p-7`}>
              <div className="text-base font-medium text-muted-foreground">Billing details</div>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="wave-email" className="text-base">Receipt email</Label>
                  <Input id="wave-email" type="email" value={email} placeholder="billing@yourcompany.com"
                    onChange={(e) => setEmail(e.target.value)} className={FIELD} />
                </div>
                {payg && (
                  <>
                    <div>
                      <Label htmlFor="wave-monthly" className="text-base">Monthly cap (USD)</Label>
                      <Input id="wave-monthly" inputMode="numeric" value={monthlyCap}
                        onChange={(e) => setMonthlyCap(e.target.value)} className={FIELD} />
                    </div>
                    <div>
                      <Label htmlFor="wave-charge" className="text-base">Per-charge cap (USD)</Label>
                      <Input id="wave-charge" inputMode="numeric" value={perChargeCap}
                        onChange={(e) => setPerChargeCap(e.target.value)} className={FIELD} />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className={`${GLASS} p-7`}>
              <Button size="lg" className="w-full text-base" disabled={busy} onClick={pay}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {payg ? "Continue to secure card setup" : `Pay ${fmtUsd(usd, 2)} securely`}
              </Button>
              <p className="mt-4 text-base text-muted-foreground">
                Payments are processed by Stripe. Card details never touch our servers, and you can change limits or
                remove the card any time from the billing tab.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default WaveCheckoutPage;
