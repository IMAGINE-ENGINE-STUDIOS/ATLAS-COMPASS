/**
 * Client helper for the `tile-intel-pipeline` edge function.
 * Rule and action saves call this to materialize the deterministic plan
 * (and, when opted in, an AI-written narration).
 */
export interface PipelineStep { id: string; label: string; }
export interface PipelinePlan { steps: PipelineStep[]; summary: string; ai?: string | null; }

const SUPABASE_URL: string =
  (import.meta as any).env?.VITE_SUPABASE_URL ||
  "https://acqvtnezswxveaqhgvgy.supabase.co";

export async function runPipeline(
  kind: "rule" | "action",
  entity: Record<string, unknown>,
  opts?: { ai?: boolean; model?: string },
): Promise<PipelinePlan | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/tile-intel-pipeline`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, entity, ai: opts?.ai, model: opts?.model }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.pipeline as PipelinePlan;
  } catch { return null; }
}