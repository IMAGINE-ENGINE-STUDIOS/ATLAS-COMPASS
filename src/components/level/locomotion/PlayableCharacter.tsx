import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import type { CharacterObject } from "@/lib/levelTypes";
import {
  pushableRegistry,
  setInteractionPrompt,
  inputPulse,
} from "./locomotionState";

/* ----------------------------- input -------------------------------- */

interface InputAxes {
  x: number;  // strafe (right +)
  z: number;  // forward (forward = -Z in world after camera rotation)
  jump: boolean;
  run: boolean;
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

type LocoState = "idle" | "walk" | "run" | "jump" | "fall" | "sit" | "use";

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
    case "jump": return find("jump_up", "jumpup", "jump") ?? find("idle") ?? names[0];
    case "fall": return find("falling", "fall", "jump_loop", "air") ?? find("jump") ?? names[0];
    case "sit":  return find("sitting", "sit") ?? find("idle") ?? names[0];
    case "use":  return find("use", "press", "interact", "wave") ?? find("idle") ?? names[0];
  }
}

/* ----------------------- collision helpers -------------------------- */

function collectStaticTargets(root: THREE.Object3D, exclude: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o === exclude) return;
    if ((o as any).isMesh) {
      // skip helpers/gizmos
      const ud = (o as any).userData ?? {};
      if (ud.__gizmo) return;
      out.push(o);
    }
  });
  return out;
}

/* ---------------------- main playable character --------------------- */

export default function PlayableCharacter({
  obj,
  enabled,
}: {
  obj: CharacterObject;
  enabled: boolean;
}) {
  const gltf = useGLTF(obj.url);
  const cloned = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);
  const rootRef = useRef<THREE.Group>(null);
  const visualRef = useRef<THREE.Group>(null);
  const { actions, names } = useAnimations(gltf.animations, cloned);
  const { camera, scene: threeScene } = useThree();

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
  const yawRef = useRef(obj.rotation[1] ?? 0);
  const stateRef = useRef<LocoState>("idle");
  const activeAction = useRef<THREE.AnimationAction | null>(null);
  const lockedActionUntil = useRef(0);
  const sittingOn = useRef<string | null>(null);

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

  // Auto-fit visual scale so the rig matches the requested capsule height.
  const visualScale = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());
    if (size.y < 0.01) return 1;
    return height / size.y;
  }, [cloned, height]);

  // Camera state
  const camOrbit = useRef({ yaw: 0, pitch: 0.25, dist: 4 });
  const pointerLocked = useRef(false);

  // Pointer-lock + mouse look (active only when enabled).
  useEffect(() => {
    if (!enabled) return;
    const gl = (threeScene as any).__r3f?.root?.getState?.()?.gl;
    const canvas: HTMLCanvasElement | undefined =
      gl?.domElement ?? document.querySelector("canvas") ?? undefined;
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
  }, [enabled, cameraMode, threeScene]);

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
    const clip = pickClip(names, next);
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

  useFrame((_, rawDt) => {
    if (!enabled || !rootRef.current) return;
    const dt = Math.min(0.05, rawDt); // clamp to keep physics stable
    const root = rootRef.current;
    const inp = sample();

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
    const staticTargets = collectStaticTargets(threeScene, root);
    // Down ray from a bit above the feet.
    tmp.raycaster.set(
      new THREE.Vector3(root.position.x, root.position.y + 1.2, root.position.z),
      tmp.down,
    );
    tmp.raycaster.far = 2.4;
    const hits = tmp.raycaster.intersectObjects(staticTargets, true);
    const groundHit = hits[0];

    // Vertical integration.
    velocityY.current -= gravity * dt;
    if (inp.jump && grounded.current) {
      velocityY.current = jumpVel;
      grounded.current = false;
      setState("jump", 0.05);
      sittingOn.current = null;
    }
    root.position.y += velocityY.current * dt;

    if (groundHit && root.position.y <= groundHit.point.y + 0.001) {
      root.position.y = groundHit.point.y;
      if (velocityY.current < 0) velocityY.current = 0;
      grounded.current = true;
    } else if (!groundHit && root.position.y < -50) {
      // safety: respawn if fell out of world
      root.position.set(obj.position[0], obj.position[1] + 2, obj.position[2]);
      velocityY.current = 0;
    } else {
      grounded.current = false;
    }

    // ---- horizontal collision (push out of nearby walls) ----
    // Cheap: cast 4 cardinal rays of length `radius + 0.1` from torso.
    const torso = new THREE.Vector3(root.position.x, root.position.y + height * 0.55, root.position.z);
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
        setState(velocityY.current > 0 ? "jump" : "fall");
      } else if (moving) {
        setState(inp.run ? "run" : "walk");
      } else {
        setState("idle");
      }
    }

    // ---- visual yaw ----
    if (visualRef.current) visualRef.current.rotation.y = yawRef.current;

    // ---- camera ----
    if (cameraMode === "first") {
      // Find a "head" bone if possible, else use top of capsule.
      let headY = root.position.y + height * 0.92;
      const head = cloned.getObjectByName("mixamorigHead") ?? cloned.getObjectByName("Head");
      if (head) {
        const wp = new THREE.Vector3();
        head.getWorldPosition(wp);
        headY = wp.y;
      }
      const pitch = camOrbit.current.pitch;
      tmp.camPos.set(
        root.position.x,
        headY,
        root.position.z,
      );
      camera.position.copy(tmp.camPos);
      tmp.camTarget.set(
        root.position.x - Math.sin(camYaw) * Math.cos(pitch),
        headY + Math.sin(pitch),
        root.position.z - Math.cos(camYaw) * Math.cos(pitch),
      );
      camera.lookAt(tmp.camTarget);
    } else {
      const dist = camOrbit.current.dist;
      const pitch = camOrbit.current.pitch;
      const targetY = root.position.y + height * 0.75;
      tmp.camTarget.set(root.position.x, targetY, root.position.z);
      tmp.camPos.set(
        root.position.x + Math.sin(camYaw) * Math.cos(pitch) * dist,
        targetY + Math.sin(pitch) * dist,
        root.position.z + Math.cos(camYaw) * Math.cos(pitch) * dist,
      );
      camera.position.lerp(tmp.camPos, Math.min(1, dt * 10));
      camera.lookAt(tmp.camTarget);
    }
  });

  return (
    <group ref={rootRef} visible={obj.visible}>
      <group ref={visualRef} scale={visualScale}>
        <primitive object={cloned} />
      </group>
    </group>
  );
}