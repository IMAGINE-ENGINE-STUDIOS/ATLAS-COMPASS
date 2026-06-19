import { useEffect } from "react";
import * as THREE from "three";
import {
  interactableRegistry,
  characterRegistry,
  emitLevelEvent,
  setHudCandidate,
  carryState,
  inputPulse,
  type HudCandidate,
} from "@/components/level/locomotion/locomotionState";

/**
 * Global Play-mode input + proximity loop. Mounted only while `playing`.
 *
 * Each frame: finds the playable character position, walks the interactable
 * registry, picks the nearest in-radius entry per key, and publishes it as
 * the HUD candidate. On keydown, fires the action of the nearest matching
 * interactable for that key.
 *
 * Grab/drop: parents the grabbed object to follow the player root each frame
 * (offset = carryOffset). Drop on second press or when playing flips off.
 */
export default function PlayInputManager({ playing }: { playing: boolean }) {
  useEffect(() => {
    if (!playing) return;
    const firedOnce = new Set<string>(); // event ids with `once: true` that fired
    const tmp = new THREE.Vector3();
    const tmp2 = new THREE.Vector3();
    let raf = 0;
    let running = true;

    // pick the first registered character (the playable). Falls back to
    // any character — the runtime guarantees exactly one playable.
    const getPlayer = (): THREE.Object3D | null => {
      for (const c of characterRegistry.values()) return c;
      return null;
    };

    const loop = () => {
      if (!running) return;
      const player = getPlayer();
      if (player) {
        player.getWorldPosition(tmp);
        let best: HudCandidate | null = null;
        for (const e of interactableRegistry.values()) {
          e.object.getWorldPosition(tmp2);
          const d = tmp.distanceTo(tmp2);
          if (d > e.radius) continue;
          if (!best || d < best.dist) {
            best = { id: e.id, kind: e.kind, key: e.key, label: e.label, dist: d };
          }
        }
        setHudCandidate(best);

        // carry follow: glue the grabbed object to the player + offset
        if (carryState.id) {
          const reg = Array.from(interactableRegistry.values()).find(
            (i) => i.id === carryState.id && i.kind === "grabbable",
          );
          if (reg) {
            const [ox, oy, oz] = carryState.carryOffset;
            // place in front of camera-facing yaw
            const yaw = player.rotation.y;
            const fx = Math.sin(yaw) * oz;
            const fz = Math.cos(yaw) * oz;
            reg.object.position.set(tmp.x + fx, tmp.y + oy, tmp.z + fz);
          } else {
            carryState.id = null;
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const isEditableTarget = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as any).isContentEditable;
    };
    const normalizeKey = (e: KeyboardEvent): string => {
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return "";
      const parts: string[] = [];
      if (e.shiftKey) parts.push("Shift");
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.metaKey) parts.push("Meta");
      let k = e.key;
      if (k === " ") k = "Space";
      if (k.length === 1) k = k.toUpperCase();
      parts.push(k);
      return parts.join("+");
    };

    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const key = normalizeKey(e);
      if (!key) return;
      const player = getPlayer();
      if (!player) return;
      player.getWorldPosition(tmp);

      // Find nearest matching interactable for this key.
      let match: typeof interactableRegistry extends Map<any, infer V> ? V | null : never = null as any;
      let bestD = Infinity;
      for (const e2 of interactableRegistry.values()) {
        if (e2.key !== key) continue;
        e2.object.getWorldPosition(tmp2);
        const d = tmp.distanceTo(tmp2);
        if (d > e2.radius) continue;
        if (d < bestD) { bestD = d; match = e2; }
      }
      if (!match) return;

      e.preventDefault();
      switch (match.kind) {
        case "grabbable": {
          if (carryState.id === match.id) carryState.id = null;
          else carryState.id = match.id;
          break;
        }
        case "event": {
          const eid = match.eventId || match.id;
          if (match.once && firedOnce.has(eid)) break;
          if (match.once) firedOnce.add(eid);
          emitLevelEvent(eid, { fromObject: match.id });
          break;
        }
        case "sittable":
        case "usable":
          // Defer to existing PlayableCharacter handling via inputPulse.
          // (Authored sittable/usable also surface a HUD prompt here.)
          inputPulse.interact = true;
          break;
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      setHudCandidate(null);
      carryState.id = null;
    };
  }, [playing]);

  return null;
}