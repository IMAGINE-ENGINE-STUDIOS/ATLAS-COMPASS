import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

type State = "loading" | "valid" | "already" | "invalid" | "success" | "error";

export default function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>("loading");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`;
    fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } })
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) setState("valid");
        else if (d.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      })
      .catch(() => setState("error"));
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setProcessing(true);
    const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", { body: { token } });
    setProcessing(false);
    if (error || !(data as any)?.success) setState("error");
    else setState("success");
  };

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md p-8 rounded-2xl bg-white/[0.03] border border-white/10 text-center space-y-4">
        {state === "loading" && <><Loader2 className="w-8 h-8 animate-spin mx-auto text-white/60" /><p className="text-white/60">Validating…</p></>}
        {state === "valid" && (
          <>
            <h1 className="text-xl font-semibold">Unsubscribe from disaster alerts?</h1>
            <p className="text-sm text-white/60">You'll stop receiving email alerts from Atlas SOS.</p>
            <button onClick={confirm} disabled={processing}
              className="w-full py-2.5 rounded-lg bg-red-500 hover:bg-red-400 disabled:opacity-50 font-semibold">
              {processing ? "Working…" : "Confirm unsubscribe"}
            </button>
          </>
        )}
        {state === "already" && <><CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" /><p>You're already unsubscribed.</p></>}
        {state === "success" && <><CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" /><p>Unsubscribed. You won't receive further alerts.</p></>}
        {state === "invalid" && <><XCircle className="w-10 h-10 text-red-400 mx-auto" /><p>This unsubscribe link is invalid or expired.</p></>}
        {state === "error" && <><XCircle className="w-10 h-10 text-red-400 mx-auto" /><p>Something went wrong. Please try again.</p></>}
      </div>
    </div>
  );
}