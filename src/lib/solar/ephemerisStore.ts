/**
 * Single-tick ephemeris store shared by the Solar system view, the Atlas
 * mini-HUDs, and any panel that needs "where is body X right now".
 *
 * - One in-flight fetch at any time; result cached in memory.
 * - One background timer (30 s) shared across all subscribers.
 * - Subscribers get called with the same immutable snapshot per tick, so
 *   they can bail out with reference equality — no re-render storms.
 *
 * The underlying data source is `fetchSolarEphemeris` (JPL Horizons via
 * the `solar-ephemeris` edge function, server-side cached 60 s).
 */
import {
  fetchSolarEphemeris,
  type SolarEphemerisResponse,
  type SolarEphemerisVector,
  type SolarBodyId,
} from "@/lib/solarSystem";

export interface EphemerisSnapshot {
  at: number;
  data: SolarEphemerisResponse;
  byId: Record<SolarBodyId, SolarEphemerisVector>;
}

type Listener = (snap: EphemerisSnapshot) => void;

let current: EphemerisSnapshot | null = null;
let inflight: Promise<EphemerisSnapshot> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let lastError: unknown = null;
const listeners = new Set<Listener>();

const REFRESH_MS = 30_000;

function indexByBody(data: SolarEphemerisResponse) {
  const byId = {} as Record<SolarBodyId, SolarEphemerisVector>;
  for (const v of data.vectors) byId[v.id] = v;
  return byId;
}

async function refresh(force = false): Promise<EphemerisSnapshot> {
  if (!force && current && Date.now() - current.at < REFRESH_MS) return current;
  if (inflight) return inflight;
  inflight = fetchSolarEphemeris()
    .then((data) => {
      const snap: EphemerisSnapshot = { at: Date.now(), data, byId: indexByBody(data) };
      current = snap;
      lastError = null;
      listeners.forEach((l) => { try { l(snap); } catch {} });
      return snap;
    })
    .catch((err) => {
      lastError = err;
      throw err;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

function ensureTimer() {
  if (timer || typeof window === "undefined") return;
  timer = setInterval(() => { refresh().catch(() => {}); }, REFRESH_MS);
}

function maybeStopTimer() {
  if (!listeners.size && timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function subscribeEphemeris(listener: Listener): () => void {
  listeners.add(listener);
  ensureTimer();
  if (current) {
    try { listener(current); } catch {}
  }
  // Kick off a fetch if we have no snapshot yet.
  if (!current) refresh().catch(() => {});
  return () => {
    listeners.delete(listener);
    maybeStopTimer();
  };
}

export function getEphemerisSnapshot(): EphemerisSnapshot | null { return current; }
export function getEphemerisError(): unknown { return lastError; }
export function forceRefreshEphemeris() { return refresh(true); }