import { useCallback, useEffect, useMemo, useState } from "react";
import { Megaphone, Loader2, ShieldAlert, Send, Users, Radar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";

const HAZARDS = [
  "earthquake", "tsunami", "flood", "wildfire", "volcano", "hurricane", "tornado",
  "storm", "landslide", "heat", "drought", "cold", "avalanche", "epidemic",
  "chemical", "nuclear", "conflict",
] as const;

const SEVERITIES = [
  { value: "1", label: "1 · Advisory" },
  { value: "2", label: "2 · Watch" },
  { value: "3", label: "3 · Warning" },
  { value: "4", label: "4 · Severe warning" },
  { value: "5", label: "5 · Extreme emergency" },
];

interface FormState {
  hazard_type: string;
  severity: string;
  title: string;
  instructions: string;
  magnitude: string;
  lat: string;
  lon: string;
  radius_km: string;
  url: string;
}

const EMPTY: FormState = {
  hazard_type: "earthquake",
  severity: "4",
  title: "",
  instructions: "",
  magnitude: "",
  lat: "",
  lon: "",
  radius_km: "",
  url: "",
};

/** Turns a possibly-empty text field into a number, or undefined when blank. */
function num(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Admin-only console for texting a warning to every matching SMS subscriber.
 * A dry run is required before the confirm dialog will send anything.
 */
export function ManualBroadcast() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [matched, setMatched] = useState<number | null>(null);
  const [busy, setBusy] = useState<"dry" | "send" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (!cancelled) setIsAdmin(false);
        return;
      }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", auth.user.id)
        .eq("role", "atlas_admin")
        .maybeSingle();
      if (cancelled) return;
      setIsAdmin(Boolean(data));
      if (data) {
        const { count } = await supabase
          .from("sms_subscribers")
          .select("id", { count: "exact", head: true })
          .eq("state", "active");
        if (!cancelled) setSubscriberCount(count ?? 0);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const set = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setMatched(null); // any edit invalidates the previous dry run
    },
    [],
  );

  const errors = useMemo(() => {
    const list: string[] = [];
    if (!form.title.trim()) list.push("A headline is required.");
    if (form.title.length > 300) list.push("Headline must be 300 characters or fewer.");
    const lat = num(form.lat);
    const lon = num(form.lon);
    if (form.lat.trim() && (lat === undefined || lat < -90 || lat > 90)) list.push("Latitude must be between -90 and 90.");
    if (form.lon.trim() && (lon === undefined || lon < -180 || lon > 180)) list.push("Longitude must be between -180 and 180.");
    if (form.url.trim() && !/^https?:\/\//i.test(form.url.trim())) list.push("Link must start with http:// or https://.");
    return list;
  }, [form]);

  const payload = useCallback(
    (dryRun: boolean) => ({
      hazard_type: form.hazard_type,
      severity: Number(form.severity),
      title: form.title.trim(),
      instructions: form.instructions.trim() || undefined,
      magnitude: num(form.magnitude),
      lat: num(form.lat),
      lon: num(form.lon),
      radius_km: num(form.radius_km),
      url: form.url.trim() || undefined,
      dry_run: dryRun,
    }),
    [form],
  );

  const invoke = useCallback(async (dryRun: boolean) => {
    setBusy(dryRun ? "dry" : "send");
    try {
      const { data, error } = await supabase.functions.invoke("sms-broadcast", {
        body: payload(dryRun),
      });
      if (error) {
        const details =
          "context" in error && error.context instanceof Response
            ? await error.context.text()
            : error.message;
        console.error("sms-broadcast failed:", details);
        toast({ title: "Broadcast failed", description: details, variant: "destructive" });
        return;
      }
      if (dryRun) {
        setMatched(data?.matched ?? 0);
        toast({
          title: "Dry run complete",
          description: `${data?.matched ?? 0} subscriber(s) match this warning.`,
        });
      } else {
        setMatched(null);
        setForm(EMPTY);
        toast({
          title: "Warning broadcast",
          description: `Sent ${data?.sent ?? 0} · failed ${data?.failed ?? 0} · already notified ${data?.skipped ?? 0}.`,
        });
      }
    } finally {
      setBusy(null);
    }
  }, [payload]);

  if (isAdmin === null) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
        Checking broadcast permissions…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-6">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <div>
          <h3 className="text-sm font-semibold">Manual SMS broadcast</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Only Atlas admins can text the subscriber base. Severe events (severity 4+) still
            broadcast automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 md:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Manual SMS broadcast</h3>
            <p className="text-xs text-muted-foreground">
              Texts every matching subscriber in their own language.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span className="tabular-nums">{subscriberCount ?? "—"}</span> active subscribers
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mb-hazard">Hazard</Label>
          <Select value={form.hazard_type} onValueChange={(v) => set("hazard_type", v)}>
            <SelectTrigger id="mb-hazard"><SelectValue /></SelectTrigger>
            <SelectContent>
              {HAZARDS.map((h) => (
                <SelectItem key={h} value={h} className="capitalize">{h}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mb-severity">Severity</Label>
          <Select value={form.severity} onValueChange={(v) => set("severity", v)}>
            <SelectTrigger id="mb-severity"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SEVERITIES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="mb-title">Headline</Label>
          <Input
            id="mb-title"
            value={form.title}
            maxLength={300}
            placeholder="M6.8 earthquake 40km SW of Antofagasta"
            onChange={(e) => set("title", e.target.value)}
          />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="mb-instructions">Official instructions</Label>
          <Textarea
            id="mb-instructions"
            value={form.instructions}
            maxLength={600}
            rows={3}
            placeholder="Move inland and to higher ground immediately. Do not return until authorities clear the area."
            onChange={(e) => set("instructions", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 md:col-span-2 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="mb-lat">Latitude</Label>
            <Input id="mb-lat" inputMode="decimal" value={form.lat} placeholder="-23.65" onChange={(e) => set("lat", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mb-lon">Longitude</Label>
            <Input id="mb-lon" inputMode="decimal" value={form.lon} placeholder="-70.40" onChange={(e) => set("lon", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mb-radius">Radius (km)</Label>
            <Input id="mb-radius" inputMode="numeric" value={form.radius_km} placeholder="300" onChange={(e) => set("radius_km", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mb-mag">Magnitude</Label>
            <Input id="mb-mag" inputMode="decimal" value={form.magnitude} placeholder="6.8" onChange={(e) => set("magnitude", e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="mb-url">Details link</Label>
          <Input id="mb-url" value={form.url} placeholder="https://earthquake.usgs.gov/…" onChange={(e) => set("url", e.target.value)} />
        </div>
      </div>

      {errors.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs text-destructive">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          disabled={busy !== null || errors.length > 0}
          onClick={() => invoke(true)}
        >
          {busy === "dry" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radar className="mr-2 h-4 w-4" />}
          Dry run
        </Button>

        <Button
          variant="destructive"
          disabled={busy !== null || errors.length > 0 || matched === null}
          onClick={() => setConfirmOpen(true)}
        >
          {busy === "send" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Broadcast warning
        </Button>

        {matched !== null && (
          <span className="text-xs text-muted-foreground">
            Dry run matched <span className="tabular-nums text-foreground">{matched}</span> subscriber(s).
          </span>
        )}
        {matched === null && errors.length === 0 && (
          <span className="text-xs text-muted-foreground">Run a dry run first to enable sending.</span>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this warning by SMS?</AlertDialogTitle>
            <AlertDialogDescription>
              {matched} subscriber(s) will receive “{form.title}” translated into their language.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => invoke(false)}>Send now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}