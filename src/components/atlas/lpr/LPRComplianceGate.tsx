import { useState } from "react";
import { AlertTriangle, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props { onAcknowledged: () => void }

export default function LPRComplianceGate({ onAcknowledged }: Props) {
  const [confirmA, setConfirmA] = useState(false);
  const [confirmB, setConfirmB] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!confirmA || !confirmB) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) { toast.error("Sign in required"); return; }
      await supabase.from("lpr_settings").upsert({
        user_id: u.user.id,
        legal_ack_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      onAcknowledged();
    } finally { setBusy(false); }
  };

  return (
    <div className="absolute inset-0 z-[90] bg-black/85 backdrop-blur-xl flex items-center justify-center p-6">
      <div className="max-w-lg w-full rounded-2xl border border-amber-500/40 bg-gradient-to-b from-slate-950 to-black p-6 text-white shadow-[0_0_60px_rgba(245,158,11,0.15)]">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-bold tracking-tight">License Plate Reader — Compliance</h2>
        </div>
        <p className="text-[12px] text-white/70 leading-relaxed mb-3">
          Atlas integrates with Rekor Scout / OpenALPR. Access is available under three modes:
        </p>
        <ul className="text-[11px] text-white/60 space-y-1.5 mb-4 pl-4 list-disc">
          <li><span className="text-cyan-300 font-semibold">Atlas Admin</span> — full platform key, no BYOK needed.</li>
          <li><span className="text-emerald-300 font-semibold">Platform-provided</span> — request and be approved by an Atlas Admin.</li>
          <li><span className="text-white/85 font-semibold">Bring-your-own key</span> — you supply a Rekor API key and take full legal responsibility.</li>
        </ul>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-amber-100/90 leading-relaxed">
              This tool relies on real-world LPR data. You are responsible for lawful use in your jurisdiction
              (DPPA, state LPR statutes, GDPR, and any private-property or driver-consent rules that apply).
              Atlas does not verify your permissible-purpose license.
            </div>
          </div>
        </div>
        <label className="flex items-start gap-2 text-[12px] text-white/85 mb-2 cursor-pointer">
          <input type="checkbox" checked={confirmA} onChange={(e) => setConfirmA(e.target.checked)} className="mt-0.5" />
          <span>I confirm I have a lawful basis to use license plate reader data for my use case.</span>
        </label>
        <label className="flex items-start gap-2 text-[12px] text-white/85 mb-4 cursor-pointer">
          <input type="checkbox" checked={confirmB} onChange={(e) => setConfirmB(e.target.checked)} className="mt-0.5" />
          <span>I accept full responsibility for how plate data is collected, stored, and disseminated through my account.</span>
        </label>
        <button
          disabled={!confirmA || !confirmB || busy}
          onClick={submit}
          className="w-full h-10 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-[12px] uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? "Saving…" : "Acknowledge & continue"}
        </button>
      </div>
    </div>
  );
}