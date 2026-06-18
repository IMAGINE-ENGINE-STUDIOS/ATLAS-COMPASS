import { useEffect, useState } from "react";
import { subscribeInteractionPrompt, type InteractionPrompt } from "./locomotionState";

export default function InteractionPromptUI() {
  const [p, setP] = useState<InteractionPrompt>({ visible: false, label: "", kind: "" });
  useEffect(() => subscribeInteractionPrompt(setP), []);
  if (!p.visible) return null;
  return (
    <div
      className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-50"
      style={{ bottom: "12%" }}
    >
      <div className="px-3 py-1.5 rounded-full bg-slate-900/85 border border-blue-400/40 backdrop-blur text-[12px] font-mono text-blue-100 shadow-lg shadow-blue-500/20">
        <span className="inline-block px-1.5 py-0.5 mr-2 text-[10px] rounded bg-blue-500/30 border border-blue-400/40 text-blue-50">E</span>
        {p.label.replace(/^Press E to /, "")}
      </div>
    </div>
  );
}