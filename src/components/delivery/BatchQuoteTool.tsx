import { useState } from "react";
import { motion } from "framer-motion";
import { Layers, Plus, Trash2, Loader2, DollarSign, ArrowRight } from "lucide-react";
import { getBatchQuotes } from "@/lib/delivery-service";
import AddressAutocomplete from "./AddressAutocomplete";

interface QuoteRequest {
  pickup_address: string;
  dropoff_address: string;
}

export default function BatchQuoteTool() {
  const [requests, setRequests] = useState<QuoteRequest[]>([
    { pickup_address: "", dropoff_address: "" },
  ]);
  const [results, setResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const addRow = () => setRequests(r => [...r, { pickup_address: "", dropoff_address: "" }]);
  const removeRow = (i: number) => setRequests(r => r.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: keyof QuoteRequest, val: string) =>
    setRequests(r => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row));

  const handleBatch = async () => {
    const valid = requests.filter(r => r.pickup_address && r.dropoff_address);
    if (!valid.length) return;
    setLoading(true);
    try {
      const data = await getBatchQuotes(valid);
      setResults(data.quotes || []);
    } catch { setResults([]); }
    setLoading(false);
  };

  const inputCls = "w-full bg-secondary/30 border border-border/30 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" /> Batch Quotes
        </h3>
        <span className="text-[10px] text-muted-foreground">{requests.length} route{requests.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="space-y-2">
        {requests.map((r, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-3 rounded-xl bg-card/40 border border-border/20">
            <span className="text-[9px] font-mono text-muted-foreground w-6 text-center">{i + 1}</span>
            <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1">
                <AddressAutocomplete value={r.pickup_address} onChange={(addr) => updateRow(i, "pickup_address", addr)} placeholder="Pickup" icon="pickup" compact />
              </div>
              <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0 hidden sm:block" />
              <div className="flex-1">
                <AddressAutocomplete value={r.dropoff_address} onChange={(addr) => updateRow(i, "dropoff_address", addr)} placeholder="Dropoff" icon="dropoff" compact />
              </div>
            </div>
            <button onClick={() => removeRow(i)} disabled={requests.length === 1} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive disabled:opacity-30">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3">
        <button onClick={addRow} className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-secondary/30 border border-border/30 text-muted-foreground hover:text-foreground flex items-center gap-1.5">
          <Plus className="w-3 h-3" /> Add Route
        </button>
        <button onClick={handleBatch} disabled={loading || !requests.some(r => r.pickup_address && r.dropoff_address)}
          className="flex-1 py-2.5 rounded-xl text-xs font-bold text-primary-foreground flex items-center justify-center gap-2 disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" }}>
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Quoting...</> : <><DollarSign className="w-4 h-4" /> Get All Quotes</>}
        </button>
      </div>

      {results && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">Results</p>
          {results.map((r, i) => (
            <div key={i} className={`p-3 rounded-xl border ${r.status === "fulfilled" && r.data?.fee ? "border-success/20 bg-success/5" : "border-destructive/20 bg-destructive/5"}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground">Route #{r.index + 1}</span>
                {r.status === "fulfilled" && r.data?.fee ? (
                  <span className="text-sm font-mono font-bold text-foreground">${(r.data.fee / 100).toFixed(2)}</span>
                ) : (
                  <span className="text-xs text-destructive">{r.error || "No quote available"}</span>
                )}
              </div>
              {r.data?.duration && <p className="text-[10px] text-muted-foreground mt-1">ETA: {r.data.duration} min</p>}
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
