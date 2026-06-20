import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import type { CharacterObject } from "@/lib/levelTypes";
import { modelForwardYawOffset } from "@/lib/modelOrientation";
import {
  pushableRegistry,
  setInteractionPrompt,
  inputPulse,
  characterRegistry,
  splineDrivenIds,
} from "./locomotionState";

/* ----------------------------- input -------------------------------- */

interface InputAxes {
  x: number;  // strafe (right +)
  z: number;  // forward (forward = -Z in world after camera rotation)
  jump: boolean;
  run: boolean;
}

export interface PlayCameraPose {
  eye: [number, number, number];
  target: [number, number, number];
  player: [number, number, number];
  cameraMode: "third" | "first";
}

function useInput(scheme: "keyboard" | "gamepad" | "both") {
  const axes = useRef<InputAxes>({ x: 0, z: 0, jump: false, run: false });
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const allowKb = scheme !== "gamepad";
    if (!allowKb) return;
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || (t as any).isContentEditable)) return;
      keys.current[e.code] = true;
      if (e.code === "KeyE") inputPulse.interact = true;
      if (["KeyW","KeyA","KeyS","KeyD","Space","ShiftLeft","ShiftRight","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      keys.current = {};
    };
  }, [scheme]);

  // Returns the *latest* axes for this frame.
  const sample = (): InputAxes => {
    let x = 0, z = 0, jump = false, run = false;
    if (scheme !== "gamepad") {
      const k = keys.current;
      if (k.KeyW || k.ArrowUp) z -= 1;
      if (k.KeyS || k.ArrowDown) z += 1;
      if (k.KeyA || k.ArrowLeft) x -= 1;
      if (k.KeyD || k.ArrowRight) x += 1;
      if (k.Space) jump = true;
      if (k.ShiftLeft || k.ShiftRight) run = true;
    }
    if (scheme !== "keyboard") {
      const pads = navigator.getGamepads?.() ?? [];
      for (const pad of pads) {
        if (!pad) continue;
        const lx = Math.abs(pad.axes[0] ?? 0) > 0.15 ? pad.axes[0] : 0;
        const ly = Math.abs(pad.axes[1] ?? 0) > 0.15 ? pad.axes[1] : 0;
        x += lx;
        z += ly;
        if (pad.buttons[0]?.pressed) jump = true;     // A / Cross
        if (pad.buttons[6]?.pressed || pad.buttons[10]?.pressed) run = true; // LT / L3
        if (pad.buttons[2]?.pressed) inputPulse.interact = true; // X / Square
        break;
      }
    }
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    axes.current = { x, z, jump, run };
    return axes.current;
  };

  return sample;
}

/* ---------------------- animation state machine --------------------- */

type LocoState =
  | "idle"
  | "walk"
  | "run"
  | "jump"          // takeoff burst
  | "fall"          // airborne / falling
  | "land"          // ground impact squat
  | "jumpDown"      // intentional drop off a ledge
  | "climb"         // climbing up a ledge / obstacle
  | "stepUp"        // walking up a small step
  | "sit"
  | "use";

function pickClip(names: string[], state: LocoState): string | null {
  if (names.length === 0) return null;
  const lower = names.map((n) => n.toLowerCase());
  const find = (...needles: string[]) => {
    for (const n of needles) {
      const i = lower.findIndex((s) => s.includes(n));
      if (i !== -1) return names[i];
    }
    return null;
  };
  switch (state) {
    case "idle": return find("idle", "tpose", "stand") ?? names[0];
    case "walk": return find("walk") ?? find("run") ?? find("idle") ?? names[0];
    case "run":  return find("run", "sprint", "jog") ?? find("walk") ?? names[0];
    case "jump": return find("jump_up", "jumpup", "jump_start", "jump") ?? find("idle") ?? names[0];
    case "fall": return find("falling", "fall_loop", "fall", "jump_loop", "air") ?? find("jump") ?? names[0];
    case "land": return find("land", "jump_land", "jump_end", "landing") ?? find("idle") ?? names[0];
    case "jumpDown": return find("jump_down", "drop", "fall_to_run", "jumping_down") ?? find("fall", "jump") ?? names[0];
    case "climb": return find("climbing", "climb_up", "climb", "hanging_climb", "ledge_climb", "vault") ?? find("jump") ?? names[0];
    case "stepUp": return find("step_up", "walk_up_stairs", "stairs_up", "stair_walk") ?? find("walk") ?? names[0];
    case "sit":  return find("sitting", "sit") ?? find("idle") ?? names[0];
    case "use":  return find("use", "press", "interact", "wave") ?? find("idle") ?? names[0];
  }
}

/* ----------------------- collision helpers -------------------------- */

function collectStaticTargets(root: THREE.Object3D, exclude: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  // Build a set of ancestors-of-exclude descendants once.
  const excludeSet = new Set<THREE.Object3D>();
  exclude.traverse((o) => excludeSet.add(o));
  root.traverse((o) => {
    if (excludeSet.has(o)) return;
    if ((o as any).isMesh) {
      // skip helpers/gizmos
      const ud = (o as any).userData ?? {};
      if (ud.__gizmo || ud.__nocast) return;
      // Skinned meshes (characters) are very expensive to raycast and we
      // handle character-vs-character separately with a cheap cylinder test.
      if ((o as any).isSkinnedMesh) return;
      if ((o as any).isLine || (o as any).isLine2 || (o as any).isLineSegments || (o as any).isLineSegments2) return;
      // Skip anything inside a spline/trajectory group.
      let p: THREE.Object3D | null = o.parent;
      while (p) {
        if (p.userData?.__spline || p.userData?.__nocast || p.userData?.__character) return;
        p = p.parent;
      }
      out.push(o);
    }
  });
  return out;
}

/* ---------------------- main playable character --------------------- */

export default function PlayableCharacter({
  obj,
  enabled,
  onCameraPose,
}: {
  obj: CharacterObject;
  enabled: boolean;
  onCameraPose?: (pose: PlayCameraPose) => void;
}) {
  const gltf = useGLTF(obj.url);
  const cloned = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);
  const rootRef = useRef<THREE.Group>(null);
  const visualRef = useRef<THREE.Group>(null);
  const { actions, names } = useAnimations(gltf.animations, cloned);
  const { camera, scene: threeScene, gl } = useThree();

  // Settings (with defaults)
  const cfg = obj.locomotion ?? {};
  const walkSpeed = cfg.walkSpeed ?? 2.2;
  const runSpeed = cfg.runSpeed ?? 5.0;
  const jumpVel = Math.sqrt(2 * (cfg.gravity ?? 18) * (cfg.jumpHeight ?? 1.2));
  const gravity = cfg.gravity ?? 18;
  const radius = cfg.radius ?? 0.32;
  const height = cfg.height ?? 1.7;
  const cameraMode = obj.cameraMode ?? "third";
  const sample = useInput(obj.controlScheme ?? "both");

  // Dynamics
  const velocityY = useRef(0);
  const grounded = useRef(true);
  const wasGrounded = useRef(true);
  const yawRef = useRef(obj.rotation[1] ?? 0);
  const stateRef = useRef<LocoState>("idle");
  const activeAction = useRef<THREE.AnimationAction | null>(null);
  const lockedActionUntil = useRef(0);
  const sittingOn = useRef<string | null>(null);
  // Climb tween (forces the root along a curve over `duration` seconds while
  // input + gravity are suspended). Animation set to "climb".
  const climb = useRef<{
    active: boolean;
    t: number;
    duration: number;
    from: THREE.Vector3;
    to: THREE.Vector3;
    yaw: number;
  }>({
    active: false,
    t: 0,
    duration: 0.75,
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    yaw: 0,
  });
  // Landing squash factor (1 = neutral, <1 = compressed). Animates back to 1.
  const squash = useRef(1);
  // Step-up vertical smoothing so small steps look like a planted footfall
  // instead of a vertical snap.
  const stepUpUntil = useRef(0);
  // Peak height tracker so we know how hard a fall lands.
  const peakY = useRef(0);

  // Mesh prep
  useEffect(() => {
    cloned.traverse((n: any) => {
      if (n.isMesh || n.isSkinnedMesh) {
        n.castShadow = true;
        n.receiveShadow = true;
        n.frustumCulled = false;
      }
    });
  }, [cloned]);

  // Respect the authored object scale (don't auto-resize the rig — that was
  // producing giant characters when the source glb already shipped at human
  // height). Then measure the actual rendered height once for camera framing.
  const visualScale: [number, number, number] = [
    obj.scale[0] ?? 1,
    obj.scale[1] ?? 1,
    obj.scale[2] ?? 1,
  ];
  const measuredHeight = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());
    const h = size.y * (obj.scale[1] ?? 1);
    return h > 0.1 ? h : 1.7;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloned, obj.scale[1]]);

  // Camera state
  const camOrbit = useRef({ yaw: 0, pitch: 0.25, dist: 4 });
  const pointerLocked = useRef(false);
  // Smooth camera-mode blend. When `cameraMode` flips, `blend` runs from 0→1
  // over `blendDuration` seconds; we lerp the eye and target from the previous
  // mode's pose to the new one instead of snapping.
  const camBlend = useRef({
    from: cameraMode,
    to: cameraMode,
    t: 1,
    duration: 0.45,
    lastEye: new THREE.Vector3(),
    lastTarget: new THREE.Vector3(),
  });
  useEffect(() => {
    // Snapshot the *current* camera as the "from" pose so the blend starts
    // exactly where the eye is right now (no visible pop).
    camBlend.current.lastEye.copy(camera.position);
    camBlend.current.lastTarget.copy(
      camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3())),
    );
    camBlend.current.from = camBlend.current.to;
    camBlend.current.to = cameraMode;
    camBlend.current.t = 0;
  }, [cameraMode, camera]);

  // Pointer-lock + mouse look (active only when enabled).
  useEffect(() => {
    if (!enabled) return;
    const canvas: HTMLCanvasElement | undefined = gl?.domElement;
    if (!canvas) return;
    const onClick = () => {
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    };
    const onLockChange = () => {
      pointerLocked.current = document.pointerLockElement === canvas;
    };
    const onMove = (e: MouseEvent) => {
      if (!pointerLocked.current) return;
      camOrbit.current.yaw -= e.movementX * 0.0025;
      camOrbit.current.pitch -= e.movementY * 0.0025;
      camOrbit.current.pitch = Math.max(-1.2, Math.min(1.2, camOrbit.current.pitch));
    };
    const onWheel = (e: WheelEvent) => {
      if (!pointerLocked.current && cameraMode !== "third") return;
      camOrbit.current.dist = Math.max(1.5, Math.min(10, camOrbit.current.dist + e.deltaY * 0.005));
    };
    canvas.addEventListener("click", onClick);
    document.addEventListener("pointerlockchange", onLockChange);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      canvas.removeEventListener("click", onClick);
      document.removeEventListener("pointerlockchange", onLockChange);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("wheel", onWheel);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    };
  }, [enabled, cameraMode, gl]);

  // Initial position: start at the object's authored position.
  useEffect(() => {
    if (!rootRef.current) return;
    rootRef.current.position.set(obj.position[0], obj.position[1], obj.position[2]);
    camOrbit.current.yaw = obj.rotation[1] ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Animation switcher.
  const setState = (next: LocoState, fade = 0.18) => {
    if (stateRef.current === next) return;
    stateRef.current = next;
    // When the user explicitly picked a clip from the animation gallery,
    // honor it for the idle / sit / use states (jumps and locomotion still
    // come from the locomotion state machine so movement feels right).
    const userPick =
      obj.currentAnimation && names.includes(obj.currentAnimation)
        ? obj.currentAnimation
        : null;
    const overrideStates: LocoState[] = ["idle", "sit", "use"];
    const clip =
      userPick && overrideStates.includes(next)
        ? userPick
        : pickClip(names, next);
    if (!clip) return;
    const action = actions[clip];
    if (!action) return;
    if (activeAction.current && activeAction.current !== action) {
      activeAction.current.fadeOut(fade);
    }
    action.reset().fadeIn(fade).play();
    // One-shot states freeze on the last frame for cleaner blends.
    if (next === "jump" || next === "use") {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
    }
    action.timeScale = obj.animationSpeed ?? 1;
    activeAction.current = action;
  };

  // React to gallery selection changes while idle / sitting so the swap is
  // visible immediately without waiting for a state transition.
  useEffect(() => {
    if (!enabled) return;
    const s = stateRef.current;
    if (s === "idle" || s === "sit" || s === "use") {
      // Force re-apply by flipping to a sentinel then back.
      stateRef.current = "fall" as LocoState;
      setState(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj.currentAnimation, names.join("|")]);

  /* --------------------- per-frame simulation --------------------- */

  const tmp = useMemo(() => ({
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    move: new THREE.Vector3(),
    down: new THREE.Vector3(0, -1, 0),
    raycaster: new THREE.Raycaster(),
    camTarget: new THREE.Vector3(),
    camPos: new THREE.Vector3(),
    sphere: new THREE.Vector3(),
  }), []);

  // Cache the static target list — rebuilding every frame walks the entire
  // scene graph (including every skinned mesh bone) which spikes badly when
  // more characters are spawned. Refresh ~4x per second; that's well within
  // tolerance for collision since static geometry doesn't move.
  const staticCache = useRef<{ targets: THREE.Object3D[]; nextAt: number }>({
    targets: [],
    nextAt: 0,
  });

  useFrame((_, rawDt) => {
    if (!enabled || !rootRef.current) return;
    const dt = Math.min(0.05, rawDt); // clamp to keep physics stable
    const root = rootRef.current;
    const inp = sample();

    // ---- climb tween: hijacks movement + gravity ----
    if (climb.current.active) {
      const c = climb.current;
      c.t = Math.min(1, c.t + dt / c.duration);
      // Ease: anticipation pull-up → push-over (classic 3-stage climb arc).
      const k = c.t;
      // Vertical first 0..0.65, then forward 0.65..1.
      const upK = Math.min(1, k / 0.65);
      const overK = Math.max(0, (k - 0.65) / 0.35);
      const easeUp = 1 - Math.pow(1 - upK, 2);   // ease-out
      const easeOver = overK * overK;             // ease-in
      const x = THREE.MathUtils.lerp(c.from.x, c.to.x, easeOver);
      const z = THREE.MathUtils.lerp(c.from.z, c.to.z, easeOver);
      const y = THREE.MathUtils.lerp(c.from.y, c.to.y, easeUp);
      root.position.set(x, y, z);
      yawRef.current = c.yaw;
      velocityY.current = 0;
      grounded.current = true;
      if (c.t >= 1) {
        c.active = false;
        lockedActionUntil.current = 0;
        setState("idle", 0.2);
      }
      if (visualRef.current) visualRef.current.rotation.y = yawRef.current;
      return; // skip the rest of the simulation this frame
    }

    // ---- horizontal movement ----
    const camYaw = camOrbit.current.yaw;
    tmp.forward.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    tmp.right.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
    tmp.move.set(0, 0, 0)
      .addScaledVector(tmp.forward, -inp.z)
      .addScaledVector(tmp.right, inp.x);
    const moving = tmp.move.lengthSq() > 1e-4;
    const speed = inp.run ? runSpeed : walkSpeed;
    if (moving) {
      tmp.move.normalize().multiplyScalar(speed * dt);
      root.position.x += tmp.move.x;
      root.position.z += tmp.move.z;
      // Smoothly turn the visual to match move direction.
      const desiredYaw = Math.atan2(tmp.move.x, tmp.move.z);
      const cur = yawRef.current;
      let delta = desiredYaw - cur;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      yawRef.current = cur + delta * Math.min(1, dt * 12);
    }

    // ---- ground / collision via raycast ----
    const now = performance.now();
    if (now >= staticCache.current.nextAt) {
      staticCache.current.targets = collectStaticTargets(threeScene, root);
      staticCache.current.nextAt = now + 250;
    }
    const staticTargets = staticCache.current.targets;
    // Down ray from a bit above the feet.
    tmp.raycaster.set(
      new THREE.Vector3(root.position.x, root.position.y + 1.2, root.position.z),
      tmp.down,
    );
    tmp.raycaster.far = 2.4;
    const hits = tmp.raycaster.intersectObjects(staticTargets, true);
    const groundHit = hits[0];

    // ---- forward ledge probe (for climb + jump-down) ----
    // Cast forward from waist height; if it hits something, measure how tall
    // that obstacle is and whether the top is walkable.
    const facingX = Math.sin(yawRef.current);
    const facingZ = Math.cos(yawRef.current);
    let ledge: { top: THREE.Vector3; obstacleHeight: number } | null = null;
    {
      const waist = new THREE.Vector3(
        root.position.x,
        root.position.y + measuredHeight * 0.55,
        root.position.z,
      );
      tmp.raycaster.set(waist, new THREE.Vector3(facingX, 0, facingZ).normalize());
      tmp.raycaster.far = radius + 0.45;
      const fh = tmp.raycaster.intersectObjects(staticTargets, true)[0];
      if (fh) {
        // Find the top of the obstacle: down-ray from above the hit point
        // onto whatever surface caps it.
        const topProbe = new THREE.Vector3(fh.point.x + facingX * 0.05, fh.point.y + 4, fh.point.z + facingZ * 0.05);
        tmp.raycaster.set(topProbe, tmp.down);
        tmp.raycaster.far = 6;
        const th = tmp.raycaster.intersectObjects(staticTargets, true)[0];
        if (th) {
          const oh = th.point.y - root.position.y;
          if (oh > 0.05 && oh < 2.2) {
            ledge = { top: th.point.clone(), obstacleHeight: oh };
          }
        }
      }
    }

    // ---- forward drop probe (for jump-down) ----
    let frontDrop = 0;
    {
      const ahead = new THREE.Vector3(
        root.position.x + facingX * (radius + 0.35),
        root.position.y + 1.2,
        root.position.z + facingZ * (radius + 0.35),
      );
      tmp.raycaster.set(ahead, tmp.down);
      tmp.raycaster.far = 6;
      const dh = tmp.raycaster.intersectObjects(staticTargets, true)[0];
      if (dh) frontDrop = root.position.y - dh.point.y;
      else frontDrop = 6;
    }

    // Vertical integration.
    velocityY.current -= gravity * dt;

    // ---- jump button branch: climb > jump-down > regular jump ----
    if (inp.jump && grounded.current) {
      const stepLimit = Math.max(0.45, cfg.maxStepHeight ?? 0.6);
      if (ledge && ledge.obstacleHeight > stepLimit && ledge.obstacleHeight <= 2.0) {
        // CLIMB up the ledge.
        const c = climb.current;
        c.active = true;
        c.t = 0;
        c.duration = 0.55 + ledge.obstacleHeight * 0.25;
        c.from.copy(root.position);
        c.to.set(
          ledge.top.x + facingX * (radius + 0.05),
          ledge.top.y + 0.001,
          ledge.top.z + facingZ * (radius + 0.05),
        );
        c.yaw = Math.atan2(facingX, facingZ);
        velocityY.current = 0;
        grounded.current = false;
        lockedActionUntil.current = performance.now() + c.duration * 1000;
        setState("climb", 0.08);
        sittingOn.current = null;
        return; // begin climb next frame
      }
      if (moving && frontDrop > 0.7) {
        // Intentional JUMP-DOWN off a ledge.
        velocityY.current = jumpVel * 0.45;
        // Push forward a touch so we clear the edge.
        root.position.x += facingX * 0.15;
        root.position.z += facingZ * 0.15;
        grounded.current = false;
        setState("jumpDown", 0.05);
        sittingOn.current = null;
        peakY.current = root.position.y;
      } else {
        // Regular jump with brief anticipation squash.
        velocityY.current = jumpVel;
        grounded.current = false;
        squash.current = 0.86;
        setState("jump", 0.05);
        sittingOn.current = null;
        peakY.current = root.position.y;
      }
    }
    if (!grounded.current) {
      peakY.current = Math.max(peakY.current, root.position.y);
    }
    root.position.y += velocityY.current * dt;

    if (groundHit && root.position.y <= groundHit.point.y + 0.001) {
      // Step-up smoothing: if the ground popped up by a small amount and we
      // were already grounded, lerp the foot upward over a short window so it
      // reads as planting a foot on a stair rather than teleporting.
      const delta = groundHit.point.y - root.position.y;
      const stepLimit = Math.max(0.45, cfg.maxStepHeight ?? 0.6);
      if (wasGrounded.current && delta > 0.04 && delta < stepLimit) {
        // Move part of the way this frame; the rest follows over 120ms.
        const a = Math.min(1, dt / 0.12);
        root.position.y += delta * a;
        if (root.position.y < groundHit.point.y) {
          // still climbing → keep playing stepUp clip
          if (stateRef.current !== "stepUp" && moving) setState("stepUp", 0.15);
          stepUpUntil.current = performance.now() + 180;
        } else {
          root.position.y = groundHit.point.y;
        }
      } else {
        root.position.y = groundHit.point.y;
      }
      // Landing impact squash when we were just airborne.
      if (!wasGrounded.current && velocityY.current < -2) {
        const fallDist = Math.max(0, peakY.current - root.position.y);
        const strength = THREE.MathUtils.clamp(fallDist / 4, 0.15, 0.55);
        squash.current = 1 - strength;
        setState("land", 0.05);
        lockedActionUntil.current = performance.now() + 220;
      }
      if (velocityY.current < 0) velocityY.current = 0;
      grounded.current = true;
    } else if (!groundHit && root.position.y < -50) {
      // safety: respawn if fell out of world
      root.position.set(obj.position[0], obj.position[1] + 2, obj.position[2]);
      velocityY.current = 0;
    } else {
      grounded.current = false;
    }
    wasGrounded.current = grounded.current;

    // Squash recovery (always tweens back to 1).
    squash.current = THREE.MathUtils.lerp(squash.current, 1, Math.min(1, dt * 8));

    // ---- horizontal collision (push out of nearby walls) ----
    // Cheap: cast 4 cardinal rays of length `radius + 0.1` from torso.
    const torso = new THREE.Vector3(root.position.x, root.position.y + measuredHeight * 0.55, root.position.z);
    const dirs = [
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
    ];
    for (const d of dirs) {
      tmp.raycaster.set(torso, d);
      tmp.raycaster.far = radius + 0.1;
      const hit = tmp.raycaster.intersectObjects(staticTargets, true)[0];
      if (hit && hit.distance < radius) {
        const push = radius - hit.distance;
        root.position.x -= d.x * push;
        root.position.z -= d.z * push;
      }
    }

    // ---- push pushables ----
    if (moving) {
      for (const [id, p] of pushableRegistry) {
        const dx = p.position.x - root.position.x;
        const dz = p.position.z - root.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > radius + 0.6) continue;
        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        // Player must be roughly moving INTO the object.
        const dot = nx * tmp.move.x + nz * tmp.move.z;
        if (dot <= 0) continue;
        const impulse = (speed * 1.4) / Math.max(0.3, p.mass);
        p.velocity.x += nx * impulse * dt * 60;
        p.velocity.z += nz * impulse * dt * 60;
        p.angularY += (Math.random() - 0.5) * 2 * dt;
        void id;
      }
    }

    // ---- push other characters (simple soft-body shove) ----
    // Cylinder vs cylinder check on XZ. Always nudges, regardless of input,
    // so two characters never overlap and the player gets a slight bump back.
    const myRadius = radius + 0.05;
    for (const [cid, cgroup] of characterRegistry) {
      if (cid === obj.id) continue;
      // Skip characters being driven by a spline — they belong to the path.
      if (splineDrivenIds.has(cid)) continue;
      const dx = cgroup.position.x - root.position.x;
      const dz = cgroup.position.z - root.position.z;
      const dist = Math.hypot(dx, dz);
      const minDist = myRadius + 0.35; // assume NPC radius ~0.3
      if (dist >= minDist || dist < 1e-4) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      const overlap = minDist - dist;
      // Push NPC out 70%, player back 30% — feels like a soft shove with
      // weight rather than the player being a wall.
      cgroup.position.x += nx * overlap * 0.7;
      cgroup.position.z += nz * overlap * 0.7;
      root.position.x -= nx * overlap * 0.3;
      root.position.z -= nz * overlap * 0.3;
    }

    // ---- proximity interactions (sit / use markers) ----
    let prompt: { visible: boolean; label: string; kind: "" | "sit" | "use" } =
      { visible: false, label: "", kind: "" };
    // World-position scan via objectWorldRefs is heavier than needed; instead,
    // walk the scene graph looking for objects tagged with userData.__interaction.
    let nearestMarker: { dist: number; id: string; kind: "sit" | "use"; pos: THREE.Vector3 } | null = null;
    threeScene.traverse((o) => {
      const k = (o as any).userData?.__interaction;
      if (k !== "sit" && k !== "use") return;
      const wp = new THREE.Vector3();
      o.getWorldPosition(wp);
      const d = wp.distanceTo(root.position);
      if (d < 1.6 && (!nearestMarker || d < nearestMarker.dist)) {
        nearestMarker = { dist: d, id: (o as any).userData.__objId ?? "", kind: k, pos: wp };
      }
    });
    if (nearestMarker) {
      prompt = {
        visible: true,
        label: nearestMarker.kind === "sit" ? "Press E to sit" : "Press E to use",
        kind: nearestMarker.kind,
      };
      if (inputPulse.interact) {
        if (nearestMarker.kind === "sit") {
          root.position.copy(nearestMarker.pos);
          sittingOn.current = nearestMarker.id;
          setState("sit", 0.3);
          lockedActionUntil.current = performance.now() + 999999;
        } else {
          setState("use", 0.15);
          lockedActionUntil.current = performance.now() + 1500;
        }
      }
    }
    // Stand up from sit on movement.
    if (sittingOn.current && (moving || inp.jump)) {
      sittingOn.current = null;
      lockedActionUntil.current = 0;
    }
    inputPulse.interact = false;
    setInteractionPrompt(prompt);

    // ---- animation state ----
    if (performance.now() > lockedActionUntil.current && !sittingOn.current) {
      if (!grounded.current) {
        setState(velocityY.current > 0.1 ? "jump" : "fall");
      } else if (performance.now() < stepUpUntil.current && moving) {
        setState("stepUp");
      } else if (moving) {
        setState(inp.run ? "run" : "walk");
      } else {
        setState("idle");
      }
    }

    // ---- visual yaw ----
    if (visualRef.current) {
      visualRef.current.rotation.y = yawRef.current;
      // Squash & stretch on Y, opposite on XZ (volume preservation).
      const sY = squash.current;
      const sXZ = 1 + (1 - sY) * 0.5;
      visualRef.current.scale.set(
        visualScale[0] * sXZ,
        visualScale[1] * sY,
        visualScale[2] * sXZ,
      );
    }

    // ---- camera ----
    // Compute the eye + target for both modes, then blend between them based
    // on `camBlend.t`. This makes mode swaps a smooth dolly instead of a jump.
    const pitch = camOrbit.current.pitch;

    // First-person pose
    let fpHeadY = root.position.y + measuredHeight * 0.92;
    const head = cloned.getObjectByName("mixamorigHead") ?? cloned.getObjectByName("Head");
    if (head) {
      const wp = new THREE.Vector3();
      head.getWorldPosition(wp);
      fpHeadY = wp.y + 0.08;
    }
    const fwdX = -Math.sin(camYaw);
    const fwdZ = -Math.cos(camYaw);
    const fpEye = new THREE.Vector3(
      root.position.x + fwdX * 0.18,
      fpHeadY,
      root.position.z + fwdZ * 0.18,
    );
    const fpTarget = new THREE.Vector3(
      fpEye.x + fwdX * Math.cos(pitch),
      fpHeadY + Math.sin(pitch),
      fpEye.z + fwdZ * Math.cos(pitch),
    );

    // Third-person pose
    const tpDist = camOrbit.current.dist * Math.max(0.6, measuredHeight / 1.8);
    const tpTargetY = root.position.y + measuredHeight * 0.7;
    const tpTarget = new THREE.Vector3(root.position.x, tpTargetY, root.position.z);
    const tpEye = new THREE.Vector3(
      root.position.x + Math.sin(camYaw) * Math.cos(pitch) * tpDist,
      tpTargetY + Math.sin(pitch) * tpDist,
      root.position.z + Math.cos(camYaw) * Math.cos(pitch) * tpDist,
    );

    const cb = camBlend.current;
    const finalEye = tmp.camPos;
    const finalTarget = tmp.camTarget;

    if (cb.t < 1) {
      cb.t = Math.min(1, cb.t + dt / cb.duration);
      // ease-in-out cubic
      const k = cb.t < 0.5 ? 4 * cb.t * cb.t * cb.t : 1 - Math.pow(-2 * cb.t + 2, 3) / 2;
      const fromEye = cb.from === "first" ? fpEye : tpEye;
      const fromTarget = cb.from === "first" ? fpTarget : tpTarget;
      // Use the snapshot eye/target so the blend starts at the *actual* last
      // camera pose, not the freshly-recomputed one (which can jitter if the
      // player moves during the swap).
      const fromEyeSnap = cb.lastEye.clone().lerp(fromEye, k);
      const fromTargetSnap = cb.lastTarget.clone().lerp(fromTarget, k);
      const toEye = cb.to === "first" ? fpEye : tpEye;
      const toTarget = cb.to === "first" ? fpTarget : tpTarget;
      finalEye.copy(fromEyeSnap.lerp(toEye, k));
      finalTarget.copy(fromTargetSnap.lerp(toTarget, k));
    } else if (cameraMode === "first") {
      finalEye.copy(fpEye);
      finalTarget.copy(fpTarget);
    } else {
      finalEye.copy(onCameraPose ? tpEye : camera.position.clone().lerp(tpEye, Math.min(1, dt * 10)));
      finalTarget.copy(tpTarget);
    }

    if (onCameraPose) {
      onCameraPose({
        eye: [finalEye.x, finalEye.y, finalEye.z],
        target: [finalTarget.x, finalTarget.y, finalTarget.z],
        player: [root.position.x, root.position.y, root.position.z],
        cameraMode,
      });
    } else {
      camera.position.copy(finalEye);
      camera.lookAt(finalTarget);
    }
  });

  return (
    <group ref={rootRef} visible={obj.visible}>
      <group ref={visualRef} scale={visualScale}>
        <group rotation={[0, modelForwardYawOffset(obj.url), 0]}>
          <primitive object={cloned} />
        </group>
      </group>
    </group>
  );
}