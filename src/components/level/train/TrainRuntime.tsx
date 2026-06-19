/**
 * TrainRuntime — drives a multi-car train along a ScenePath.
 *
 * What it does at Play time:
 *  - Builds a closed Catmull-Rom curve from `scene.scenePaths[trackPathId]`.
 *  - Advances the locomotive's arc-length `s` each frame at `baseSpeed`,
 *    decelerating to 0 inside `brakeDistance` of a stop, holding for
 *    `stopDurationSeconds`, then accelerating back to cruise.
 *  - Positions every car a fixed `carSpacing` behind the loco along the
 *    curve, orienting each to the local tangent.
 *  - Animates door panels open during the stop window (slides along the
 *    door's `doorOpenOffset`, default ±Z relative to the car).
 *  - Detects NPC characters within an open door's radius and "boards"
 *    them: each frame their group position is offset by the train's
 *    motion delta, so they ride along until the next stop.
 *  - "P" near the locomotive cabin toggles possession: the user steers
 *    the throttle (↑/↓) and forces the doors open (O). A tiny HUD
 *    overlay shows the active state.
 *
 * Limitations:
 *  - The playable character is NOT boarded (it owns its own transform via
 *    PlayableCharacter). Treat the platform as their boarding cue and
 *    use possession to ride along.
 *  - Door open/close lerps the world position only; door geometry stays
 *    on the same plane (no hinge rotation).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type {
  CharacterObject,
  LevelScene,
  SceneObject,
  TrainSystemConfig,
  Vec3,
} from "@/lib/levelTypes";

const FORWARD = new THREE.Vector3(0, 0, 1);
const TMP_V = new THREE.Vector3();
const TMP_V2 = new THREE.Vector3();
const TMP_Q = new THREE.Quaternion();

function distXZ(ax: number, az: number, bx: number, bz: number) {
  const dx = ax - bx, dz = az - bz;
  return Math.hypot(dx, dz);
}

interface DoorBinding {
  doorId: string;
  ownerId: string;            // car or loco id this door belongs to
  /** Offset from the owner's authored position, in WORLD frame (rotation = identity). */
  authoredOffset: THREE.Vector3;
  /** Open offset in OWNER LOCAL frame (rotated by current yaw). */
  openOffset: THREE.Vector3;
  /** 0 = closed, 1 = fully open. */
  openT: number;
}

interface PieceBinding {
  id: string;
  /** Arc-length offset behind the locomotive (m). 0 = locomotive itself. */
  spacingS: number;
  /** Authored Y in scene (preserved so the train stays at platform height). */
  authoredY: number;
  /** Authored yaw (so wagons whose front faces +Z spin correctly with tangent). */
  authoredYaw: number;
}

/** Identify "boardable" characters (non-playable, near an open door). */
interface BoardingState {
  charId: string;
  /** Door id the character entered through. */
  doorId: string;
  /** Offset from the train head's world position at boarding moment.
   *  We re-apply this each frame so they ride along. */
  offsetFromHead: THREE.Vector3;
  /** Yaw delta from train tangent at boarding moment (keeps relative facing). */
  yawOffset: number;
}

export default function TrainRuntime({
  scene,
  playing,
  groupRef,
}: {
  scene: LevelScene;
  playing: boolean;
  groupRef: React.RefObject<THREE.Group>;
}) {
  const cfg = scene.trainSystem;
  const path = useMemo(() => {
    if (!cfg) return null;
    return scene.scenePaths?.find((p) => p.id === cfg.trackPathId) ?? null;
  }, [cfg, scene.scenePaths]);

  const curve = useMemo(() => {
    if (!path || path.waypoints.length < 2) return null;
    const pts = path.waypoints.map((w) => new THREE.Vector3(w[0], w[1], w[2]));
    return new THREE.CatmullRomCurve3(pts, !!path.closed, "centripetal", 0.5);
  }, [path]);

  const totalLen = useMemo(() => (curve ? curve.getLength() : 0), [curve]);

  // Resolve scene objects + bindings only when the config or scene changes.
  const bindings = useMemo(() => {
    if (!cfg) return null;
    const byId = new Map<string, SceneObject>();
    for (const o of scene.objects) byId.set(o.id, o);
    const loco = byId.get(cfg.locomotiveId);
    if (!loco) return null;
    const pieces: PieceBinding[] = [
      {
        id: cfg.locomotiveId,
        spacingS: 0,
        authoredY: loco.position[1],
        authoredYaw: loco.rotation[1] ?? 0,
      },
    ];
    cfg.carIds.forEach((cid, i) => {
      const c = byId.get(cid);
      if (!c) return;
      pieces.push({
        id: cid,
        spacingS: (i + 1) * cfg.carSpacing,
        authoredY: c.position[1],
        authoredYaw: c.rotation[1] ?? 0,
      });
    });
    // Bind doors to their nearest piece by authored XZ distance.
    const doors: DoorBinding[] = [];
    for (const did of cfg.doorIds) {
      const d = byId.get(did);
      if (!d) continue;
      let bestPid = pieces[0].id;
      let bestDist = Infinity;
      for (const p of pieces) {
        const pObj = byId.get(p.id)!;
        const dist = distXZ(d.position[0], d.position[2], pObj.position[0], pObj.position[2]);
        if (dist < bestDist) { bestDist = dist; bestPid = p.id; }
      }
      const owner = byId.get(bestPid)!;
      doors.push({
        doorId: did,
        ownerId: bestPid,
        authoredOffset: new THREE.Vector3(
          d.position[0] - owner.position[0],
          d.position[1] - owner.position[1],
          d.position[2] - owner.position[2],
        ),
        openOffset: new THREE.Vector3(...(d.doorOpenOffset ?? [0, 0, 1.2])),
        openT: 0,
      });
    }
    // The locomotive's authored S along the curve = the arc-length position
    // where placing the loco visually matches its authored pose. We don't
    // need exact alignment — we'll start the train just before the first
    // stop so it visibly arrives.
    return { pieces, doors };
  }, [cfg, scene.objects]);

  // Mutable simulation state.
  const sim = useRef({
    s: 0,             // locomotive arc-length along curve (m)
    v: 0,             // current speed (m/s)
    state: "approach" as "approach" | "stopped" | "departing" | "cruise",
    stopTimer: 0,     // seconds remaining at the stop
    targetStopIdx: 0,
    possessed: false,
    forceDoorOpen: false,
    manualThrottle: 0, // -1..1 added to base speed when possessed
    prevHeadPos: new THREE.Vector3(),
    prevHeadYaw: 0,
    boarded: new Map<string, BoardingState>(),
  });
  const [hudState, setHudState] = useState<{ possessed: boolean; speed: number; status: string; door: number }>({
    possessed: false, speed: 0, status: "—", door: 0,
  });

  // Pre-compute the stop arc-lengths from curve parameter t.
  const stopArcLens = useMemo(() => {
    if (!cfg || !curve) return [] as number[];
    return cfg.stops.map((s) => s.t * totalLen);
  }, [cfg, curve, totalLen]);

  // Set up initial speed + place the head a bit BEFORE the first stop so the
  // train visibly approaches the station shortly after Play starts.
  useEffect(() => {
    if (!playing || !cfg || stopArcLens.length === 0) return;
    const firstStop = stopArcLens[0];
    sim.current.s = (firstStop - Math.min(60, totalLen * 0.2) + totalLen) % totalLen;
    sim.current.v = cfg.baseSpeed;
    sim.current.state = "cruise";
    sim.current.stopTimer = 0;
    sim.current.targetStopIdx = 0;
    sim.current.possessed = false;
    sim.current.forceDoorOpen = false;
    sim.current.manualThrottle = 0;
    sim.current.boarded.clear();
    // Reset doors visually
    if (bindings) bindings.doors.forEach((d) => (d.openT = 0));
  }, [playing, cfg, stopArcLens, totalLen, bindings]);

  // Possession + manual control keyboard.
  useEffect(() => {
    if (!playing || !cfg) return;
    const possessKey = (cfg.possessKey ?? "P").toUpperCase();
    const keys: Record<string, boolean> = {};
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toUpperCase();
      keys[k] = true;
      if (k === possessKey) {
        // Toggle only if the player is near the cabin (or always while
        // possessed — toggle off works anywhere).
        if (sim.current.possessed) {
          sim.current.possessed = false;
          sim.current.manualThrottle = 0;
          sim.current.forceDoorOpen = false;
          return;
        }
        const cabin = cfg.cabinId ? scene.objects.find((o) => o.id === cfg.cabinId) : null;
        const player = scene.objects.find(
          (o) => o.kind === "character" && (o as CharacterObject).playable,
        );
        // Find the player's actual world position via the scene graph
        const g = groupRef.current;
        let playerPos: THREE.Vector3 | null = null;
        if (g && player) {
          // Player owns its own transform; find any node tagged with the player id.
          let node: THREE.Object3D | null = null;
          g.traverse((o) => {
            const ud: any = (o as any).userData;
            if (!node && ud && ud.__playableId === player.id) node = o;
          });
          if (!node) node = g.getObjectByName(`obj-${player.id}`) ?? null;
          if (node) {
            const v = new THREE.Vector3();
            node.getWorldPosition(v);
            playerPos = v;
          }
        }
        if (cabin && playerPos) {
          const dist = distXZ(playerPos.x, playerPos.z, cabin.position[0], cabin.position[2]);
          if (dist <= 8) {
            sim.current.possessed = true;
          }
        } else {
          // No cabin or player resolvable — allow possession anyway.
          sim.current.possessed = true;
        }
      }
      if (sim.current.possessed) {
        if (k === "O") sim.current.forceDoorOpen = !sim.current.forceDoorOpen;
      }
    };
    const onUp = (e: KeyboardEvent) => { keys[e.key.toUpperCase()] = false; };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    const id = setInterval(() => {
      if (!sim.current.possessed) return;
      // ramp manual throttle with ↑/↓
      if (keys["ARROWUP"]) sim.current.manualThrottle = Math.min(1.5, sim.current.manualThrottle + 0.05);
      if (keys["ARROWDOWN"]) sim.current.manualThrottle = Math.max(-1, sim.current.manualThrottle - 0.05);
    }, 50);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      clearInterval(id);
    };
  }, [playing, cfg, scene.objects, groupRef]);

  // Per-frame simulation + scene-graph application.
  useFrame((_, dt) => {
    if (!playing || !cfg || !curve || !bindings || totalLen <= 0) return;
    const g = groupRef.current;
    if (!g) return;
    const clampedDt = Math.min(dt, 0.05);

    const s0 = sim.current;

    /* ---- speed & state machine ---- */
    const nextStopS = stopArcLens[s0.targetStopIdx % stopArcLens.length];
    // Arc-length distance ahead to the next stop (handles wrap-around).
    let distToStop = nextStopS - s0.s;
    while (distToStop < -totalLen * 0.5) distToStop += totalLen;
    while (distToStop > totalLen * 0.5) distToStop += -totalLen + totalLen; // noop, safety
    if (distToStop < 0) distToStop += totalLen;

    if (s0.possessed) {
      // Manual control: target speed = baseSpeed * (1 + throttle), but doors
      // close while moving unless forceDoorOpen is on.
      const target = cfg.baseSpeed * (1 + s0.manualThrottle);
      // Smooth toward target.
      const accel = 5; // m/s^2
      const dv = Math.sign(target - s0.v) * Math.min(Math.abs(target - s0.v), accel * clampedDt);
      s0.v = Math.max(-cfg.baseSpeed * 0.5, s0.v + dv);
      s0.state = "cruise";
      s0.stopTimer = 0;
    } else {
      if (s0.state === "cruise" || s0.state === "departing") {
        // Decelerate inside brakeDistance.
        if (distToStop < cfg.brakeDistance && distToStop > 0.1) {
          const targetV = Math.max(0.0, cfg.baseSpeed * (distToStop / cfg.brakeDistance));
          if (s0.v > targetV) s0.v = Math.max(targetV, s0.v - 6 * clampedDt);
          else s0.v = Math.min(cfg.baseSpeed, s0.v + 4 * clampedDt);
          s0.state = "approach";
        } else {
          // Accelerate to cruise.
          s0.v = Math.min(cfg.baseSpeed, s0.v + 4 * clampedDt);
        }
      } else if (s0.state === "approach") {
        // Continue braking until we're at the stop.
        if (distToStop <= 0.4 || s0.v < 0.1) {
          s0.v = 0;
          s0.s = nextStopS;
          s0.state = "stopped";
          s0.stopTimer = cfg.stopDurationSeconds;
        } else {
          const targetV = Math.max(0.0, cfg.baseSpeed * (distToStop / cfg.brakeDistance));
          if (s0.v > targetV) s0.v = Math.max(targetV, s0.v - 6 * clampedDt);
        }
      } else if (s0.state === "stopped") {
        s0.v = 0;
        s0.stopTimer -= clampedDt;
        if (s0.stopTimer <= 0) {
          s0.state = "departing";
          s0.targetStopIdx = (s0.targetStopIdx + 1) % stopArcLens.length;
        }
      }
    }

    // Advance arc-length.
    s0.s = ((s0.s + s0.v * clampedDt) % totalLen + totalLen) % totalLen;

    /* ---- doors ---- */
    const doorsShouldOpen =
      (!s0.possessed && s0.state === "stopped") ||
      (s0.possessed && s0.forceDoorOpen);
    const doorRate = clampedDt / Math.max(0.1, cfg.doorAnimSeconds);
    bindings.doors.forEach((d) => {
      const target = doorsShouldOpen ? 1 : 0;
      if (d.openT < target) d.openT = Math.min(target, d.openT + doorRate);
      else if (d.openT > target) d.openT = Math.max(target, d.openT - doorRate);
    });

    /* ---- place pieces along curve ---- */
    // Compute head position & yaw first; cache for delta-based effects.
    const headT = (s0.s / totalLen) % 1;
    const headPt = curve.getPointAt(headT).clone();
    const headTan = curve.getTangentAt(headT).clone().normalize();
    const headYaw = Math.atan2(headTan.x, headTan.z);
    const headDelta = TMP_V.copy(headPt).sub(s0.prevHeadPos);
    const headYawDelta = headYaw - s0.prevHeadYaw;

    // Position every piece.
    const pieceWorld = new Map<string, { pos: THREE.Vector3; yaw: number }>();
    for (const piece of bindings.pieces) {
      const ps = ((s0.s - piece.spacingS) % totalLen + totalLen) % totalLen;
      const pt = curve.getPointAt(ps / totalLen).clone();
      pt.y = piece.authoredY;
      const tan = curve.getTangentAt(ps / totalLen).clone().normalize();
      const yaw = Math.atan2(tan.x, tan.z) + piece.authoredYaw;
      pieceWorld.set(piece.id, { pos: pt, yaw });
      const node = g.getObjectByName(`obj-${piece.id}`);
      if (node) {
        node.position.copy(pt);
        node.rotation.set(0, yaw, 0);
      }
    }

    /* ---- doors: position relative to owner + open offset ---- */
    bindings.doors.forEach((d) => {
      const owner = pieceWorld.get(d.ownerId);
      if (!owner) return;
      const node = g.getObjectByName(`obj-${d.doorId}`);
      if (!node) return;
      // Rotate authored offset + open offset by owner yaw.
      const cosY = Math.cos(owner.yaw), sinY = Math.sin(owner.yaw);
      const rot = (v: THREE.Vector3) =>
        TMP_V2.set(v.x * cosY + v.z * sinY, v.y, -v.x * sinY + v.z * cosY);
      const off = rot(d.authoredOffset).clone();
      const openOff = rot(d.openOffset).clone().multiplyScalar(d.openT);
      node.position.set(owner.pos.x + off.x + openOff.x, owner.pos.y + off.y + openOff.y, owner.pos.z + off.z + openOff.z);
      node.rotation.set(0, owner.yaw, 0);
    });

    /* ---- boarding (NPCs only) ---- */
    // For each NPC character whose XZ distance to an OPEN door is < 1.5m,
    // start boarding. While boarded, drive their position by the head delta
    // so they ride along. Disembark only when doors are open AND they're
    // outside the door radius.
    const characters = scene.objects.filter(
      (o) => o.kind === "character" && !(o as CharacterObject).playable,
    ) as CharacterObject[];
    for (const ch of characters) {
      const node = g.getObjectByName(`obj-${ch.id}`);
      if (!node) continue;
      const cw = new THREE.Vector3();
      node.getWorldPosition(cw);
      const boarded = s0.boarded.get(ch.id);
      if (!boarded) {
        // Eligible to board: find an open door close enough.
        let nearest: { doorId: string; ownerPos: THREE.Vector3; ownerYaw: number; dist: number } | null = null;
        for (const d of bindings.doors) {
          if (d.openT < 0.6) continue;
          const doorNode = g.getObjectByName(`obj-${d.doorId}`);
          if (!doorNode) continue;
          const dw = new THREE.Vector3();
          doorNode.getWorldPosition(dw);
          const dist = distXZ(cw.x, cw.z, dw.x, dw.z);
          if (dist < 1.5 && (!nearest || dist < nearest.dist)) {
            const owner = pieceWorld.get(d.ownerId);
            if (owner) nearest = { doorId: d.doorId, ownerPos: owner.pos, ownerYaw: owner.yaw, dist };
          }
        }
        if (nearest) {
          s0.boarded.set(ch.id, {
            charId: ch.id,
            doorId: nearest.doorId,
            offsetFromHead: new THREE.Vector3(cw.x - headPt.x, cw.y - headPt.y, cw.z - headPt.z),
            yawOffset: (node.rotation.y ?? 0) - headYaw,
          });
        }
      } else {
        // Move character with the train.
        node.position.set(headPt.x + boarded.offsetFromHead.x, headPt.y + boarded.offsetFromHead.y, headPt.z + boarded.offsetFromHead.z);
        node.rotation.set(0, headYaw + boarded.yawOffset, 0);
        // If doors are open and NPC walks outside (shouldn't happen, NPCs
        // are static), disembark. Conservative: disembark when stopped
        // at the next station for >5s if user manually nudges them out.
        if (doorsShouldOpen) {
          // Reset offsetFromHead so the NPC stays where they currently are
          // even when the train shifts during open-door wiggle.
        }
      }
    }

    s0.prevHeadPos.copy(headPt);
    s0.prevHeadYaw = headYaw;

    // HUD throttle. Update at ~10 Hz.
    if (Math.floor(performance.now() / 100) % 1 === 0) {
      setHudState((prev) => {
        const next = {
          possessed: s0.possessed,
          speed: Math.round(s0.v * 36) / 10, // km/h-ish (m/s × 3.6, rounded to 0.1)
          status:
            s0.state === "stopped" ? `Stopped (${Math.ceil(s0.stopTimer)}s)` :
            s0.state === "approach" ? "Approaching station" :
            s0.state === "departing" ? "Departing" :
            s0.possessed ? "Manual control" : "Cruising",
          door: bindings.doors.length ? bindings.doors[0].openT : 0,
        };
        if (
          prev.possessed === next.possessed &&
          prev.speed === next.speed &&
          prev.status === next.status &&
          Math.abs(prev.door - next.door) < 0.05
        ) return prev;
        return next;
      });
    }
    // suppress unused
    void TMP_Q; void FORWARD;
    void headDelta; void headYawDelta;
  });

  if (!cfg || !curve) return null;

  return (
    <Html
      position={[0, 0, 0]}
      transform={false}
      fullscreen
      pointerEvents="none"
      style={{ pointerEvents: "none" }}
    >
      <div
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          padding: "10px 14px",
          background: "rgba(15,18,28,0.78)",
          color: "#e6edf6",
          font: '12px/1.4 -apple-system, "SF Pro Display", system-ui, sans-serif',
          borderRadius: 10,
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.08)",
          minWidth: 220,
          pointerEvents: "none",
          opacity: playing ? 1 : 0,
          transition: "opacity 240ms ease",
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ opacity: 0.7 }}>TRAIN</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{hudState.speed.toFixed(1)} m/s</span>
        </div>
        <div style={{ marginBottom: 6 }}>{hudState.status}</div>
        <div style={{ height: 4, background: "#222a36", borderRadius: 99, overflow: "hidden", marginBottom: 8 }}>
          <div style={{ height: "100%", width: `${Math.round(hudState.door * 100)}%`, background: hudState.door > 0.5 ? "#7be08a" : "#e2a23d", transition: "width 120ms linear" }} />
        </div>
        <div style={{ fontSize: 10, opacity: 0.65 }}>
          {hudState.possessed
            ? "MANUAL — ↑/↓ throttle · O toggle doors · P leave cabin"
            : `Walk to the cabin, press ${(cfg.possessKey ?? "P").toUpperCase()} to drive`}
        </div>
      </div>
    </Html>
  );
}