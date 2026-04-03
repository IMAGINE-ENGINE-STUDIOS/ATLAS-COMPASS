import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Package, Truck, Loader2, CheckCircle2, Clock,
  DollarSign, Navigation, Shield, FileSignature, Calendar,
  ChevronDown, ChevronUp, Zap, AlertCircle, ArrowRight
} from "lucide-react";
import { getDeliveryQuote, createDelivery } from "@/lib/delivery-service";

type Step = "addresses" | "options" | "quote" | "confirm" | "success";

export default function NewDeliveryForm() {
  const [step, setStep] = useState<Step>("addresses");

  // Address fields
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");

  // Contact fields
  const [pickupName, setPickupName] = useState("");
  const [pickupPhone, setPickupPhone] = useState("");
  const [dropoffName, setDropoffName] = useState("");
  const [dropoffPhone, setDropoffPhone] = useState("");

  // Manifest
  const [itemDescription, setItemDescription] = useState("");
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemSize, setItemSize] = useState<"small" | "medium" | "large" | "xlarge">("small");

  // Options
  const [requireSignature, setRequireSignature] = useState(false);
  const [requireIdVerification, setRequireIdVerification] = useState(false);
  const [tip, setTip] = useState(0);
  const [pickupNotes, setPickupNotes] = useState("");
  const [dropoffNotes, setDropoffNotes] = useState("");
  const [externalId, setExternalId] = useState("");
  const [undeliverableAction, setUndeliverableAction] = useState("return");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Scheduling
  const [schedulePickup, setSchedulePickup] = useState(false);
  const [pickupReadyDt, setPickupReadyDt] = useState("");
  const [pickupDeadlineDt, setPickupDeadlineDt] = useState("");

  // State
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [delivery, setDelivery] = useState<any>(null);
  const [error, setError] = useState("");

  const handleGetQuote = async () => {
    if (!pickupAddress || !dropoffAddress) return;
    setLoading(true);
    setError("");
    try {
      const result = await getDeliveryQuote(pickupAddress, dropoffAddress);
      if (result.error) { setError(result.error); return; }
      setQuote(result);
      setStep("quote");
    } catch { setError("Failed to get quote"); } finally { setLoading(false); }
  };

  const handleCreateDelivery = async () => {
    if (!pickupName || !pickupPhone || !dropoffName || !dropoffPhone || !itemDescription) return;
    setLoading(true);
    setError("");
    try {
      const result = await createDelivery(
        quote.id || quote.quote_id,
        { name: pickupName, phone_number: pickupPhone, address: pickupAddress, notes: pickupNotes || undefined },
        { name: dropoffName, phone_number: dropoffPhone, address: dropoffAddress, notes: dropoffNotes || undefined },
        { description: itemDescription, quantity: itemQuantity },
        {
          tip: tip > 0 ? tip * 100 : undefined,
          requires_dropoff_signature: requireSignature || undefined,
          requires_id_verification: requireIdVerification || undefined,
          external_id: externalId || undefined,
          undeliverable_action: undeliverableAction,
          pickup_ready_dt: schedulePickup && pickupReadyDt ? pickupReadyDt : undefined,
          pickup_deadline_dt: schedulePickup && pickupDeadlineDt ? pickupDeadlineDt : undefined,
          manifest_items: [{ description: itemDescription, quantity: itemQuantity, size: itemSize }],
        }
      );
      if (result.error) { setError(result.error); return; }
      setDelivery(result);
      setStep("success");
    } catch { setError("Failed to create delivery"); } finally { setLoading(false); }
  };

  const inputCls = "w-full bg-secondary/30 border border-border/30 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary";
  const labelCls = "text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1.5 block";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Progress */}
      <div className="flex items-center gap-2">
        {["addresses", "options", "quote", "confirm", "success"].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
              step === s ? "bg-primary text-primary-foreground" :
              ["addresses", "options", "quote", "confirm", "success"].indexOf(step) > i ? "bg-primary/30 text-primary" :
              "bg-muted text-muted-foreground"
            }`}>{i + 1}</div>
            {i < 4 && <div className="w-6 h-0.5 bg-border/40" />}
          </div>
        ))}
      </div>

      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-destructive" />
          <span className="text-xs text-destructive">{error}</span>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {/* Step 1: Addresses */}
        {step === "addresses" && (
          <motion.div key="addr" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2"><MapPin className="w-5 h-5 text-primary" /> Addresses</h3>
            <div>
              <label className={labelCls}>Pickup Address</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-success" />
                <input value={pickupAddress} onChange={e => setPickupAddress(e.target.value)} placeholder="123 Pickup Street, City, State" className={`${inputCls} pl-8`} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Dropoff Address</label>
              <div className="relative">
                <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary" />
                <input value={dropoffAddress} onChange={e => setDropoffAddress(e.target.value)} placeholder="456 Delivery Ave, City, State" className={`${inputCls} pl-8`} />
              </div>
            </div>
            <button onClick={() => setStep("options")} disabled={!pickupAddress || !dropoffAddress}
              className="w-full py-3 rounded-xl text-xs font-bold text-primary-foreground flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" }}>
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {/* Step 2: Options */}
        {step === "options" && (
          <motion.div key="opts" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2"><Package className="w-5 h-5 text-primary" /> Delivery Details</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Pickup Contact</label>
                <input value={pickupName} onChange={e => setPickupName(e.target.value)} placeholder="Name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Pickup Phone</label>
                <input value={pickupPhone} onChange={e => setPickupPhone(e.target.value)} placeholder="+1 555-0000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Recipient Name</label>
                <input value={dropoffName} onChange={e => setDropoffName(e.target.value)} placeholder="Name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Recipient Phone</label>
                <input value={dropoffPhone} onChange={e => setDropoffPhone(e.target.value)} placeholder="+1 555-0000" className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Item Description</label>
              <input value={itemDescription} onChange={e => setItemDescription(e.target.value)} placeholder="e.g. 2x Electronics Package" className={inputCls} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Quantity</label>
                <input type="number" min={1} value={itemQuantity} onChange={e => setItemQuantity(+e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Package Size</label>
                <select value={itemSize} onChange={e => setItemSize(e.target.value as any)} className={inputCls}>
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                  <option value="xlarge">X-Large</option>
                </select>
              </div>
            </div>

            {/* Toggles */}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 p-3 rounded-xl bg-secondary/20 border border-border/20 cursor-pointer">
                <input type="checkbox" checked={requireSignature} onChange={e => setRequireSignature(e.target.checked)} className="accent-primary" />
                <FileSignature className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-foreground">Require Signature</span>
              </label>
              <label className="flex items-center gap-2 p-3 rounded-xl bg-secondary/20 border border-border/20 cursor-pointer">
                <input type="checkbox" checked={requireIdVerification} onChange={e => setRequireIdVerification(e.target.checked)} className="accent-primary" />
                <Shield className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-foreground">ID Verification</span>
              </label>
            </div>

            {/* Tip */}
            <div>
              <label className={labelCls}>Tip for Courier ($)</label>
              <div className="flex gap-2">
                {[0, 2, 5, 10].map(t => (
                  <button key={t} onClick={() => setTip(t)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${tip === t ? "bg-primary text-primary-foreground" : "bg-secondary/30 border border-border/30 text-muted-foreground"}`}>
                    {t === 0 ? "None" : `$${t}`}
                  </button>
                ))}
                <input type="number" min={0} value={tip} onChange={e => setTip(+e.target.value)} className={`${inputCls} w-20`} />
              </div>
            </div>

            {/* Advanced toggle */}
            <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Advanced Options
            </button>

            <AnimatePresence>
              {showAdvanced && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-3 overflow-hidden">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Pickup Notes</label>
                      <textarea value={pickupNotes} onChange={e => setPickupNotes(e.target.value)} placeholder="Gate code, floor..." className={`${inputCls} h-16 resize-none`} />
                    </div>
                    <div>
                      <label className={labelCls}>Dropoff Notes</label>
                      <textarea value={dropoffNotes} onChange={e => setDropoffNotes(e.target.value)} placeholder="Leave at door..." className={`${inputCls} h-16 resize-none`} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>External Order ID</label>
                      <input value={externalId} onChange={e => setExternalId(e.target.value)} placeholder="ORD-12345" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>If Undeliverable</label>
                      <select value={undeliverableAction} onChange={e => setUndeliverableAction(e.target.value)} className={inputCls}>
                        <option value="return">Return to pickup</option>
                        <option value="leave_at_door">Leave at door</option>
                      </select>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 p-3 rounded-xl bg-secondary/20 border border-border/20 cursor-pointer">
                    <input type="checkbox" checked={schedulePickup} onChange={e => setSchedulePickup(e.target.checked)} className="accent-primary" />
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-foreground">Schedule Pickup</span>
                  </label>
                  {schedulePickup && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Ready At</label>
                        <input type="datetime-local" value={pickupReadyDt} onChange={e => setPickupReadyDt(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Deadline</label>
                        <input type="datetime-local" value={pickupDeadlineDt} onChange={e => setPickupDeadlineDt(e.target.value)} className={inputCls} />
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex gap-3">
              <button onClick={() => setStep("addresses")} className="px-6 py-3 rounded-xl text-xs font-semibold bg-secondary/40 text-muted-foreground border border-border/30">Back</button>
              <button onClick={handleGetQuote} disabled={loading || !pickupName || !dropoffName || !itemDescription}
                className="flex-1 py-3 rounded-xl text-xs font-bold text-primary-foreground flex items-center justify-center gap-2 disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" }}>
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Getting Quote...</> : <><DollarSign className="w-4 h-4" /> Get Quote</>}
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 3: Quote */}
        {step === "quote" && quote && (
          <motion.div key="quote" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2"><Zap className="w-5 h-5 text-primary" /> Delivery Quote</h3>

            <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <DollarSign className="w-5 h-5 text-primary mx-auto mb-1" />
                  <p className="text-[10px] text-muted-foreground">Fee</p>
                  <p className="text-xl font-mono font-bold text-foreground">${((quote.fee || 0) / 100).toFixed(2)}</p>
                </div>
                <div className="text-center">
                  <Clock className="w-5 h-5 text-primary mx-auto mb-1" />
                  <p className="text-[10px] text-muted-foreground">ETA</p>
                  <p className="text-xl font-mono font-bold text-foreground">{quote.duration || "~30"}m</p>
                </div>
                <div className="text-center">
                  <Truck className="w-5 h-5 text-primary mx-auto mb-1" />
                  <p className="text-[10px] text-muted-foreground">Type</p>
                  <p className="text-sm font-bold text-foreground">{quote.kind || "Standard"}</p>
                </div>
              </div>
              {quote.expires && (
                <p className="text-[10px] text-center text-muted-foreground">Quote expires: {new Date(quote.expires).toLocaleString()}</p>
              )}
            </div>

            <div className="p-4 rounded-xl bg-secondary/20 border border-border/20 space-y-2">
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-full bg-success mt-1.5" />
                <div><p className="text-[10px] font-mono text-muted-foreground">FROM</p><p className="text-xs text-foreground">{pickupAddress}</p></div>
              </div>
              <div className="flex items-start gap-2">
                <Navigation className="w-2 h-2 text-primary mt-1.5" />
                <div><p className="text-[10px] font-mono text-muted-foreground">TO</p><p className="text-xs text-foreground">{dropoffAddress}</p></div>
              </div>
            </div>

            {tip > 0 && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-success/5 border border-success/20">
                <span className="text-xs text-muted-foreground">Courier Tip</span>
                <span className="text-sm font-bold text-success">${tip.toFixed(2)}</span>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep("options")} className="px-6 py-3 rounded-xl text-xs font-semibold bg-secondary/40 text-muted-foreground border border-border/30">Back</button>
              <button onClick={handleCreateDelivery} disabled={loading}
                className="flex-1 py-3 rounded-xl text-xs font-bold text-primary-foreground flex items-center justify-center gap-2 disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" }}>
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : <><Truck className="w-4 h-4" /> Confirm & Create</>}
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 5: Success */}
        {step === "success" && delivery && (
          <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>
            <h3 className="text-xl font-bold text-foreground">Delivery Created!</h3>
            <p className="text-sm text-muted-foreground">A courier will be assigned shortly. Track your delivery in real-time.</p>
            <div className="p-4 rounded-xl bg-secondary/20 border border-border/20 text-left space-y-2">
              <div className="flex justify-between"><span className="text-xs text-muted-foreground">Delivery ID</span><span className="text-xs font-mono text-foreground">{delivery.id}</span></div>
              <div className="flex justify-between"><span className="text-xs text-muted-foreground">Status</span><span className="text-xs font-semibold text-primary">{delivery.status}</span></div>
              {delivery.tracking_url && (
                <a href={delivery.tracking_url} target="_blank" rel="noopener noreferrer" className="block text-xs text-primary hover:underline">Open Tracking Link →</a>
              )}
            </div>
            <button onClick={() => { setStep("addresses"); setQuote(null); setDelivery(null); setError(""); }}
              className="px-6 py-3 rounded-xl text-xs font-bold bg-primary text-primary-foreground">Create Another</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
