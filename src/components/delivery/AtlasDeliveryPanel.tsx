import { useState, useCallback } from "react";
import {
  Truck, X, MapPin, Package, Loader2, CheckCircle2, Clock,
  DollarSign, Navigation, Shield, FileSignature, Zap,
  AlertCircle, ArrowRight, ArrowLeft, ChevronDown, ChevronUp,
  Phone, User, Eye, Copy, Ban, Edit3
} from "lucide-react";
import {
  getDeliveryQuote, getDeliveryEstimate, createDelivery,
  getDeliveryStatus, cancelDelivery, updateTip, listDeliveries,
  getProofOfDelivery, haversineDistance, getDeliveryZone, zoneInfo,
} from "@/lib/delivery-service";
import AddressAutocomplete from "./AddressAutocomplete";

type View = "home" | "estimate" | "new" | "tracking" | "list";
type NewStep = "addresses" | "details" | "quote" | "confirm" | "done";

interface Props {
  onClose: () => void;
  /** Pre-fill pickup/dropoff from Atlas points */
  initialPickup?: { address: string; lat?: number; lng?: number };
  initialDropoff?: { address: string; lat?: number; lng?: number };
}

/* ── Shared style helpers ── */
const glass = "bg-white/[0.04] border border-white/[0.08] rounded-xl";
const inputCls = `w-full ${glass} px-4 py-2.5 text-sm text-white outline-none focus:border-primary/40 placeholder:text-white/20 transition-colors`;
const labelCls = "text-[9px] font-mono text-white/40 uppercase tracking-wider mb-1.5 block";
const btnPrimary = "w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary/20 border border-primary/30 rounded-xl text-sm font-medium text-primary hover:bg-primary/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed";
const btnSecondary = "px-4 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white/50 hover:text-white/70 transition-colors";

export default function AtlasDeliveryPanel({ onClose, initialPickup, initialDropoff }: Props) {
  const [view, setView] = useState<View>("home");

  return (
    <div className="space-y-0 max-h-[calc(100dvh-10rem)] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          {view !== "home" && (
            <button onClick={() => setView("home")} className="p-1 rounded-lg text-white/40 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <Truck className="w-5 h-5 text-primary" />
          <span className="text-sm font-bold text-white">Uber Direct</span>
        </div>
        <button onClick={onClose}><X className="w-4 h-4 text-white/40 hover:text-white" /></button>
      </div>

      {view === "home" && <HomeView onNavigate={setView} />}
      {view === "estimate" && <EstimateView />}
      {view === "new" && <NewDeliveryView initialPickup={initialPickup} initialDropoff={initialDropoff} onDone={(id) => { setView("tracking"); setTrackingId(id); }} />}
      {view === "tracking" && <TrackingView />}
      {view === "list" && <DeliveryListView onTrack={(id) => { setTrackingId(id); setView("tracking"); }} />}
    </div>
  );

  // We need these as closures for cross-view communication
  function setTrackingId(id: string) {
    trackingIdRef = id;
  }
}

let trackingIdRef = "";

/* ── HOME VIEW ── */
function HomeView({ onNavigate }: { onNavigate: (v: View) => void }) {
  const actions = [
    { key: "estimate" as View, icon: <Zap className="w-5 h-5" />, label: "Quick Estimate", desc: "Instant fee estimate between any two points", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
    { key: "new" as View, icon: <Package className="w-5 h-5" />, label: "New Delivery", desc: "Full delivery with contacts, options & tracking", color: "text-primary", bg: "bg-primary/10 border-primary/20" },
    { key: "tracking" as View, icon: <Navigation className="w-5 h-5" />, label: "Track Delivery", desc: "Monitor an active delivery in real-time", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
    { key: "list" as View, icon: <Eye className="w-5 h-5" />, label: "All Deliveries", desc: "View history and manage active deliveries", color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
  ];

  return (
    <div className="space-y-2">
      {actions.map(a => (
        <button key={a.key} onClick={() => onNavigate(a.key)}
          className={`w-full flex items-center gap-3 p-3 rounded-xl border ${a.bg} hover:brightness-125 transition-all text-left`}>
          <div className={a.color}>{a.icon}</div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${a.color}`}>{a.label}</p>
            <p className="text-[10px] text-white/30">{a.desc}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-white/20" />
        </button>
      ))}
      <div className="text-[9px] text-white/20 text-center pt-2 font-mono">
        Powered by Uber Direct API · Global Coverage
      </div>
    </div>
  );
}

/* ── ESTIMATE VIEW ── */
function EstimateView() {
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [loading, setLoading] = useState(false);
  const [estimate, setEstimate] = useState<any>(null);
  const [error, setError] = useState("");

  const handleEstimate = async () => {
    if (!pickup || !dropoff) return;
    setLoading(true); setError("");
    try {
      const data = await getDeliveryEstimate(pickup, dropoff);
      if (data.error) setError(data.error);
      else setEstimate(data);
    } catch { setError("Failed to get estimate"); }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-white/30">Instant fee estimate without creating a binding quote.</p>
      <div>
        <label className={labelCls}>Pickup</label>
        <AddressAutocomplete value={pickup} onChange={addr => setPickup(addr)} placeholder="Pickup address" icon="pickup" compact />
      </div>
      <div>
        <label className={labelCls}>Dropoff</label>
        <AddressAutocomplete value={dropoff} onChange={addr => setDropoff(addr)} placeholder="Dropoff address" icon="dropoff" compact />
      </div>
      <button onClick={handleEstimate} disabled={loading || !pickup || !dropoff} className={btnPrimary}>
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Estimating...</> : <><Zap className="w-4 h-4" /> Get Estimate</>}
      </button>
      {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20"><AlertCircle className="w-4 h-4 text-red-400" /><span className="text-[11px] text-red-300">{error}</span></div>}
      {estimate && !estimate.error && (
        <div className={`${glass} p-4`}>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><DollarSign className="w-4 h-4 text-primary mx-auto mb-1" /><p className="text-[9px] text-white/30">Fee</p><p className="text-lg font-mono font-bold text-white">${((estimate.fee || 0) / 100).toFixed(2)}</p></div>
            <div><Clock className="w-4 h-4 text-primary mx-auto mb-1" /><p className="text-[9px] text-white/30">ETA</p><p className="text-lg font-mono font-bold text-white">{estimate.eta || "~30"}m</p></div>
            <div><Truck className="w-4 h-4 text-primary mx-auto mb-1" /><p className="text-[9px] text-white/30">Currency</p><p className="text-sm font-bold text-white">{estimate.currency || "USD"}</p></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── NEW DELIVERY VIEW (multi-step wizard) ── */
function NewDeliveryView({ initialPickup, initialDropoff, onDone }: { initialPickup?: { address: string }; initialDropoff?: { address: string }; onDone: (id: string) => void }) {
  const [step, setStep] = useState<NewStep>("addresses");
  const [pickupAddr, setPickupAddr] = useState(initialPickup?.address || "");
  const [dropoffAddr, setDropoffAddr] = useState(initialDropoff?.address || "");
  const [pickupName, setPickupName] = useState("");
  const [pickupPhone, setPickupPhone] = useState("");
  const [dropoffName, setDropoffName] = useState("");
  const [dropoffPhone, setDropoffPhone] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  const [itemQty, setItemQty] = useState(1);
  const [itemSize, setItemSize] = useState<"small"|"medium"|"large"|"xlarge">("small");
  const [requireSig, setRequireSig] = useState(false);
  const [requireId, setRequireId] = useState(false);
  const [tip, setTip] = useState(0);
  const [pickupNotes, setPickupNotes] = useState("");
  const [dropoffNotes, setDropoffNotes] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [undeliverable, setUndeliverable] = useState("return");

  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [delivery, setDelivery] = useState<any>(null);
  const [error, setError] = useState("");

  const steps: NewStep[] = ["addresses", "details", "quote", "confirm", "done"];
  const stepIdx = steps.indexOf(step);

  const handleGetQuote = async () => {
    if (!pickupAddr || !dropoffAddr) return;
    setLoading(true); setError("");
    try {
      const result = await getDeliveryQuote(pickupAddr, dropoffAddr);
      if (result.error) { setError(typeof result.error === "string" ? result.error : JSON.stringify(result.error)); }
      else { setQuote(result); setStep("quote"); }
    } catch { setError("Failed to get quote"); }
    setLoading(false);
  };

  const handleCreate = async () => {
    setLoading(true); setError("");
    try {
      const result = await createDelivery(
        quote.id || quote.quote_id,
        { name: pickupName, phone_number: pickupPhone, address: pickupAddr, notes: pickupNotes || undefined },
        { name: dropoffName, phone_number: dropoffPhone, address: dropoffAddr, notes: dropoffNotes || undefined },
        { description: itemDesc, quantity: itemQty },
        {
          tip: tip > 0 ? tip * 100 : undefined,
          requires_dropoff_signature: requireSig || undefined,
          requires_id_verification: requireId || undefined,
          undeliverable_action: undeliverable,
          manifest_items: [{ description: itemDesc, quantity: itemQty, size: itemSize }],
        }
      );
      if (result.error) { setError(typeof result.error === "string" ? result.error : JSON.stringify(result.error)); }
      else { setDelivery(result); setStep("done"); }
    } catch { setError("Failed to create delivery"); }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold ${
              i === stepIdx ? "bg-primary text-primary-foreground" : i < stepIdx ? "bg-primary/30 text-primary" : "bg-white/[0.06] text-white/20"
            }`}>{i + 1}</div>
            {i < 4 && <div className="w-4 h-0.5 bg-white/[0.06]" />}
          </div>
        ))}
      </div>

      {error && <div className="flex items-center gap-2 p-2 rounded-xl bg-red-500/10 border border-red-500/20"><AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" /><span className="text-[10px] text-red-300">{error}</span></div>}

      {/* Step 1: Addresses */}
      {step === "addresses" && (
        <div className="space-y-3">
          <div><label className={labelCls}>Pickup Address</label><AddressAutocomplete value={pickupAddr} onChange={a => setPickupAddr(a)} placeholder="Pickup address" icon="pickup" compact /></div>
          <div><label className={labelCls}>Dropoff Address</label><AddressAutocomplete value={dropoffAddr} onChange={a => setDropoffAddr(a)} placeholder="Dropoff address" icon="dropoff" compact /></div>
          <button onClick={() => setStep("details")} disabled={!pickupAddr || !dropoffAddr} className={btnPrimary}>Continue <ArrowRight className="w-4 h-4" /></button>
        </div>
      )}

      {/* Step 2: Details */}
      {step === "details" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelCls}>Pickup Name</label><input value={pickupName} onChange={e => setPickupName(e.target.value)} placeholder="Name" className={inputCls} /></div>
            <div><label className={labelCls}>Pickup Phone</label><input value={pickupPhone} onChange={e => setPickupPhone(e.target.value)} placeholder="+1 555-0000" className={inputCls} /></div>
            <div><label className={labelCls}>Recipient</label><input value={dropoffName} onChange={e => setDropoffName(e.target.value)} placeholder="Name" className={inputCls} /></div>
            <div><label className={labelCls}>Recipient Phone</label><input value={dropoffPhone} onChange={e => setDropoffPhone(e.target.value)} placeholder="+1 555-0000" className={inputCls} /></div>
          </div>
          <div><label className={labelCls}>Item Description</label><input value={itemDesc} onChange={e => setItemDesc(e.target.value)} placeholder="e.g. Electronics Package" className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelCls}>Quantity</label><input type="number" min={1} value={itemQty} onChange={e => setItemQty(+e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Size</label><select value={itemSize} onChange={e => setItemSize(e.target.value as any)} className={inputCls}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option><option value="xlarge">X-Large</option></select></div>
          </div>
          {/* Toggles */}
          <div className="grid grid-cols-2 gap-2">
            <label className={`flex items-center gap-2 p-2.5 rounded-xl ${glass} cursor-pointer`}>
              <input type="checkbox" checked={requireSig} onChange={e => setRequireSig(e.target.checked)} className="accent-primary" />
              <FileSignature className="w-3.5 h-3.5 text-white/40" />
              <span className="text-[10px] text-white">Signature</span>
            </label>
            <label className={`flex items-center gap-2 p-2.5 rounded-xl ${glass} cursor-pointer`}>
              <input type="checkbox" checked={requireId} onChange={e => setRequireId(e.target.checked)} className="accent-primary" />
              <Shield className="w-3.5 h-3.5 text-white/40" />
              <span className="text-[10px] text-white">ID Check</span>
            </label>
          </div>
          {/* Tip */}
          <div>
            <label className={labelCls}>Courier Tip</label>
            <div className="flex gap-1.5">
              {[0, 2, 5, 10].map(t => (
                <button key={t} onClick={() => setTip(t)} className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold ${tip === t ? "bg-primary/20 text-primary border border-primary/30" : `${glass} text-white/40`}`}>
                  {t === 0 ? "None" : `$${t}`}
                </button>
              ))}
            </div>
          </div>
          {/* Advanced */}
          <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60">
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Advanced
          </button>
          {showAdvanced && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div><label className={labelCls}>Pickup Notes</label><textarea value={pickupNotes} onChange={e => setPickupNotes(e.target.value)} placeholder="Gate code..." className={`${inputCls} h-14 resize-none`} /></div>
                <div><label className={labelCls}>Dropoff Notes</label><textarea value={dropoffNotes} onChange={e => setDropoffNotes(e.target.value)} placeholder="Leave at door..." className={`${inputCls} h-14 resize-none`} /></div>
              </div>
              <div><label className={labelCls}>If Undeliverable</label><select value={undeliverable} onChange={e => setUndeliverable(e.target.value)} className={inputCls}><option value="return">Return to pickup</option><option value="leave_at_door">Leave at door</option></select></div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setStep("addresses")} className={btnSecondary}>Back</button>
            <button onClick={handleGetQuote} disabled={loading || !pickupName || !dropoffName || !itemDesc} className={`flex-1 ${btnPrimary}`}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Getting Quote...</> : <><DollarSign className="w-4 h-4" /> Get Quote</>}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Quote */}
      {step === "quote" && quote && (
        <div className="space-y-3">
          <div className={`${glass} p-4`}>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><DollarSign className="w-4 h-4 text-primary mx-auto mb-1" /><p className="text-[9px] text-white/30">Fee</p><p className="text-lg font-mono font-bold text-white">${((quote.fee || 0) / 100).toFixed(2)}</p></div>
              <div><Clock className="w-4 h-4 text-primary mx-auto mb-1" /><p className="text-[9px] text-white/30">ETA</p><p className="text-lg font-mono font-bold text-white">{quote.duration || "~30"}m</p></div>
              <div><Truck className="w-4 h-4 text-primary mx-auto mb-1" /><p className="text-[9px] text-white/30">Type</p><p className="text-sm font-bold text-white">{quote.kind || "Standard"}</p></div>
            </div>
            {quote.expires && <p className="text-[9px] text-center text-white/20 mt-2">Expires: {new Date(quote.expires).toLocaleString()}</p>}
          </div>
          <div className={`${glass} p-3 space-y-2`}>
            <div className="flex items-start gap-2"><div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 shrink-0" /><div><p className="text-[9px] text-white/30 font-mono">FROM</p><p className="text-[11px] text-white">{pickupAddr}</p></div></div>
            <div className="flex items-start gap-2"><Navigation className="w-2 h-2 text-primary mt-1.5 shrink-0" /><div><p className="text-[9px] text-white/30 font-mono">TO</p><p className="text-[11px] text-white">{dropoffAddr}</p></div></div>
          </div>
          {tip > 0 && <div className="flex items-center justify-between p-2 rounded-xl bg-green-500/5 border border-green-500/20"><span className="text-[10px] text-white/40">Tip</span><span className="text-sm font-bold text-green-400">${tip}</span></div>}
          <div className="flex gap-2">
            <button onClick={() => setStep("details")} className={btnSecondary}>Back</button>
            <button onClick={() => setStep("confirm")} className={`flex-1 ${btnPrimary}`}>Confirm & Create <ArrowRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Step 4: Confirm */}
      {step === "confirm" && (
        <div className="space-y-3">
          <div className={`${glass} p-3`}>
            <p className="text-[9px] text-white/40 uppercase mb-2">Order Summary</p>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between"><span className="text-white/40">Item</span><span className="text-white">{itemDesc} × {itemQty}</span></div>
              <div className="flex justify-between"><span className="text-white/40">Size</span><span className="text-white capitalize">{itemSize}</span></div>
              <div className="flex justify-between"><span className="text-white/40">Fee</span><span className="text-white font-mono">${((quote?.fee || 0) / 100).toFixed(2)}</span></div>
              {tip > 0 && <div className="flex justify-between"><span className="text-white/40">Tip</span><span className="text-green-400">${tip}</span></div>}
              {requireSig && <div className="flex justify-between"><span className="text-white/40">Signature</span><span className="text-amber-400">Required</span></div>}
              {requireId && <div className="flex justify-between"><span className="text-white/40">ID Verification</span><span className="text-amber-400">Required</span></div>}
            </div>
          </div>
          <button onClick={handleCreate} disabled={loading} className={btnPrimary}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating Delivery...</> : <><Truck className="w-4 h-4" /> Create Delivery</>}
          </button>
          <button onClick={() => setStep("quote")} className={`w-full ${btnSecondary}`}>Back</button>
        </div>
      )}

      {/* Step 5: Done */}
      {step === "done" && delivery && (
        <div className="space-y-3 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto" />
          <p className="text-sm font-bold text-white">Delivery Created!</p>
          <div className={`${glass} p-3`}>
            <p className="text-[9px] text-white/30 mb-1">Delivery ID</p>
            <p className="text-xs font-mono text-white break-all">{delivery.id}</p>
          </div>
          <button onClick={() => onDone(delivery.id)} className={btnPrimary}><Navigation className="w-4 h-4" /> Track Delivery</button>
        </div>
      )}
    </div>
  );
}

/* ── TRACKING VIEW ── */
function TrackingView() {
  const [deliveryId, setDeliveryId] = useState(trackingIdRef || "");
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pod, setPod] = useState<any>(null);

  const statusSteps = [
    { key: "pending", label: "Placed", icon: Package },
    { key: "pickup", label: "Picking Up", icon: MapPin },
    { key: "pickup_complete", label: "Picked Up", icon: CheckCircle2 },
    { key: "dropoff", label: "En Route", icon: Truck },
    { key: "delivered", label: "Delivered", icon: CheckCircle2 },
  ];

  const fetchStatus = async () => {
    if (!deliveryId) return;
    setLoading(true); setError("");
    try {
      const data = await getDeliveryStatus(deliveryId);
      if (data.error) setError(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      else setStatus(data);
    } catch { setError("Failed to fetch status"); }
    setLoading(false);
  };

  const fetchPOD = async () => {
    try {
      const data = await getProofOfDelivery(deliveryId);
      setPod(data);
    } catch {}
  };

  const handleCancel = async () => {
    if (!confirm("Cancel this delivery?")) return;
    try {
      await cancelDelivery(deliveryId);
      fetchStatus();
    } catch {}
  };

  const stepMap: Record<string, number> = { pending: 0, pickup: 1, pickup_complete: 2, dropoff: 3, delivered: 4 };
  const currentStep = status ? (stepMap[status.status] ?? 0) : -1;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={deliveryId} onChange={e => setDeliveryId(e.target.value)} placeholder="Enter delivery ID..." className={`flex-1 ${inputCls}`} />
        <button onClick={fetchStatus} disabled={loading || !deliveryId} className="px-3 py-2 bg-primary/20 border border-primary/30 rounded-xl text-primary text-sm disabled:opacity-30">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      {error && <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-[10px] text-red-300">{error}</div>}

      {status && (
        <>
          {/* Timeline */}
          <div className="space-y-0">
            {statusSteps.map((s, i) => {
              const Icon = s.icon;
              const done = i < currentStep;
              const active = i === currentStep;
              return (
                <div key={s.key} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${done || active ? "bg-primary" : "bg-white/[0.06]"}`}>
                      <Icon className={`w-3 h-3 ${done || active ? "text-primary-foreground" : "text-white/20"}`} />
                    </div>
                    {i < 4 && <div className={`w-0.5 h-4 ${done ? "bg-primary" : "bg-white/[0.06]"}`} />}
                  </div>
                  <p className={`text-[11px] pt-1 ${active ? "text-primary font-semibold" : done ? "text-white" : "text-white/20"}`}>{s.label}</p>
                </div>
              );
            })}
          </div>

          {/* Courier info */}
          {status.courier && (
            <div className={`${glass} p-3 flex items-center gap-3`}>
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"><User className="w-4 h-4 text-primary" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{status.courier.name}</p>
                <p className="text-[10px] text-white/30">{status.courier.vehicle_type}</p>
              </div>
              {status.courier.phone_number && (
                <a href={`tel:${status.courier.phone_number}`} className="p-1.5 rounded-lg bg-primary/10 text-primary"><Phone className="w-3.5 h-3.5" /></a>
              )}
            </div>
          )}

          {/* ETA */}
          {status.dropoff_eta && (
            <div className="flex items-center gap-2 p-2 rounded-xl bg-primary/5 border border-primary/20">
              <Clock className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] text-white">ETA: {new Date(status.dropoff_eta).toLocaleTimeString()}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={fetchStatus} className={`flex-1 ${btnSecondary} text-[10px]`}>↻ Refresh</button>
            {status.status !== "delivered" && status.status !== "canceled" && (
              <button onClick={handleCancel} className="flex-1 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] text-red-400">
                <Ban className="w-3 h-3 inline mr-1" /> Cancel
              </button>
            )}
            {status.status === "delivered" && (
              <button onClick={fetchPOD} className={`flex-1 ${btnSecondary} text-[10px]`}>📋 POD</button>
            )}
          </div>

          {/* Proof of Delivery */}
          {pod && (
            <div className={`${glass} p-3`}>
              <p className="text-[9px] text-white/40 uppercase mb-2">Proof of Delivery</p>
              {pod.photo && <img src={pod.photo} alt="POD" className="w-full rounded-lg mb-2" />}
              {pod.signature && <p className="text-[10px] text-white/40">Signature: ✓ Collected</p>}
              {pod.pin_code_verified && <p className="text-[10px] text-white/40">PIN: ✓ Verified</p>}
              {pod.complete_dt && <p className="text-[10px] text-white/30">Completed: {new Date(pod.complete_dt).toLocaleString()}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── DELIVERY LIST VIEW ── */
function DeliveryListView({ onTrack }: { onTrack: (id: string) => void }) {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchList = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await listDeliveries();
      if (data.error) setError(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      else setDeliveries(data.data || data.deliveries || (Array.isArray(data) ? data : []));
    } catch { setError("Failed to load deliveries"); }
    setLoading(false);
  }, []);

  return (
    <div className="space-y-3">
      <button onClick={fetchList} disabled={loading} className={btnPrimary}>
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading...</> : <><Eye className="w-4 h-4" /> Load Deliveries</>}
      </button>
      {error && <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-[10px] text-red-300">{error}</div>}
      {deliveries.length > 0 && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {deliveries.map((d: any, i: number) => (
            <button key={d.id || i} onClick={() => onTrack(d.id)}
              className={`w-full flex items-center gap-3 p-2.5 rounded-xl ${glass} hover:bg-white/[0.06] text-left transition-colors`}>
              <Truck className={`w-4 h-4 shrink-0 ${d.status === "delivered" ? "text-green-400" : d.status === "canceled" ? "text-red-400" : "text-primary"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-white font-mono truncate">{d.id?.slice(0, 16)}...</p>
                <p className="text-[9px] text-white/30 capitalize">{d.status || "unknown"}</p>
              </div>
              <ArrowRight className="w-3 h-3 text-white/20" />
            </button>
          ))}
        </div>
      )}
      {deliveries.length === 0 && !loading && !error && (
        <div className="text-center py-6"><Truck className="w-8 h-8 text-white/10 mx-auto mb-2" /><p className="text-[11px] text-white/30">Click to load your deliveries</p></div>
      )}
    </div>
  );
}