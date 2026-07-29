import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Crosshair, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";

type Phase = "idle" | "locating" | "saving" | "done" | "error";

interface SavedResult {
  username: string;
  place: string;
  accuracy_m: number | null;
  hazards: string[];
}

/**
 * Landing page for the one-tap "share my exact location" link texted to
 * SMS subscribers. Deliberately dependency-light and readable on any phone.
 */
const ShareLocationPage = () => {
  const { token } = useParams<{ token: string }>();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<SavedResult | null>(null);

  useEffect(() => {
    document.title = "Share your location · HOT warnings";
    const meta = document.querySelector('meta[name="description"]');
    meta?.setAttribute(
      "content",
      "Share your exact location so HOT can send you disaster warnings and official instructions for your area.",
    );
  }, []);

  const share = useCallback(() => {
    if (!token) {
      setPhase("error");
      setMessage("This link is incomplete. Text LOC to get a new one.");
      return;
    }
    if (!navigator.geolocation) {
      setPhase("error");
      setMessage("This device cannot share GPS. Reply to our text with your city and country instead.");
      return;
    }

    setPhase("locating");
    setMessage("");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setPhase("saving");
        try {
          const { data, error } = await supabase.functions.invoke("sms-location", {
            body: {
              token,
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            },
          });
          if (error) throw error;
          if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
          setResult(data as SavedResult);
          setPhase("done");
        } catch (err) {
          console.error("sms-location failed:", err);
          setPhase("error");
          setMessage(
            err instanceof Error && err.message
              ? err.message
              : "We could not save your location. Text LOC for a fresh link.",
          );
        }
      },
      (err) => {
        setPhase("error");
        setMessage(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was blocked. Allow it in your browser, or reply to our text with your city and country."
            : "We could not read your GPS. Reply to our text with your city and country instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }, [token]);

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card/70 backdrop-blur-xl p-7 shadow-2xl">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-destructive">
          <TriangleAlert className="h-4 w-4" />
          HOT warnings
        </div>

        <h1 className="mt-4 text-2xl font-semibold leading-tight">
          {phase === "done" ? "You are protected" : "Share your exact location"}
        </h1>

        {phase !== "done" && (
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            We only warn you about hazards near you. Sharing precise GPS makes the difference between
            a country-wide alert and a street-level one.
          </p>
        )}

        {phase === "done" && result && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Saved for <span className="font-mono text-foreground">@{result.username}</span> near{" "}
              <span className="text-foreground">{result.place}</span>
              {result.accuracy_m ? ` (±${result.accuracy_m}m)` : ""}.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {result.hazards.map((h) => (
                <span
                  key={h}
                  className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] uppercase tracking-wide"
                >
                  {h}
                </span>
              ))}
            </div>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Your number and coordinates are stored server-side only and are never shown publicly.
              Text STOP at any time to erase your alerts.
            </p>
          </div>
        )}

        {message && (
          <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive-foreground">
            {message}
          </p>
        )}

        {phase !== "done" && (
          <Button
            onClick={share}
            disabled={phase === "locating" || phase === "saving"}
            size="lg"
            className="mt-6 w-full gap-2"
          >
            {phase === "locating" || phase === "saving" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {phase === "locating" ? "Reading GPS…" : "Saving…"}
              </>
            ) : (
              <>
                <Crosshair className="h-4 w-4" />
                Share my location
              </>
            )}
          </Button>
        )}

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Prefer not to? Reply to our text with your city and country.
        </p>
      </div>
    </main>
  );
};

export default ShareLocationPage;