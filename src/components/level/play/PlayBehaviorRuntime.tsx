import { useEffect } from "react";
import * as THREE from "three";
import {
  objectWorldRefs,
  registerInteractable,
  unregisterInteractable,
  carryState,
  clearEventLog,
  type InteractableKind,
} from "@/components/level/locomotion/locomotionState";
import { resolvePlayBehavior, type SceneObject } from "@/lib/levelTypes";

/**
 * Mounts when `playing === true`. For every object in the scene:
 *  - Hides meshes flagged `invisibleInPlay`, restoring on cleanup.
 *  - Tags `collision: "none"` meshes with `userData.__nocast` so the player
 *    raycaster ignores them.
 *  - Registers grabbable / event / sittable / usable interactables in the
 *    global registry so `PlayInputManager` can resolve key presses.
 *
 * No 3D nodes — pure side-effect component. Rendered outside the R3F canvas.
 */
export default function PlayBehaviorRuntime({
  objects,
  playing,
}: {
  objects: SceneObject[];
  playing: boolean;
}) {
  useEffect(() => {
    if (!playing) return;
    clearEventLog();
    carryState.id = null;

    // Snapshot per-mesh original state so we can restore on Stop.
    const meshRestore: Array<{ mesh: THREE.Object3D; visible: boolean; nocast?: boolean }> = [];
    const registered: Array<{ id: string; kind: InteractableKind }> = [];

    const apply = () => {
      for (const obj of objects) {
        const beh = resolvePlayBehavior(obj as any);
        const root = objectWorldRefs.get(obj.id);
        if (!root) continue;

        // Mesh-level flags (visibility + collision)
        root.traverse((n) => {
          const isMesh = (n as any).isMesh || (n as any).isSkinnedMesh;
          if (!isMesh) return;
          const ud = (n as any).userData ?? ((n as any).userData = {});
          // record originals once
          if (!ud.__playSaved) {
            meshRestore.push({ mesh: n, visible: n.visible, nocast: ud.__nocast });
            ud.__playSaved = true;
          }
          if (beh.invisibleInPlay) n.visible = false;
          if (beh.collision === "none") ud.__nocast = true;
        });

        // Key-triggered interactables
        const radius = beh.interactRadius ?? 2.5;
        const reg = (kind: InteractableKind, key: string, label: string, extra?: Partial<{ eventId: string; once: boolean }>) => {
          if (!key) return;
          registerInteractable({
            id: obj.id, kind, key, label, radius, object: root,
            eventId: extra?.eventId,
            once: extra?.once,
          });
          registered.push({ id: obj.id, kind });
        };
        if (beh.grabbable) reg("grabbable", beh.grabbable.key || "E", `Pick up ${obj.name}`);
        if (beh.sittable)  reg("sittable",  beh.sittable.key  || "E", `Sit on ${obj.name}`);
        if (beh.usable)    reg("usable",    beh.usable.key    || "E", beh.usable.label || `Use ${obj.name}`);
        if (beh.event)     reg("event",     beh.event.key     || "F", `→ ${beh.event.eventId}`, { eventId: beh.event.eventId, once: beh.event.once });
      }
    };

    // Object refs may populate after first paint; retry briefly.
    apply();
    const t1 = window.setTimeout(apply, 150);
    const t2 = window.setTimeout(apply, 600);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      for (const r of registered) unregisterInteractable(r.id, r.kind);
      for (const m of meshRestore) {
        m.mesh.visible = m.visible;
        const ud = (m.mesh as any).userData;
        if (ud) {
          if (m.nocast === undefined) delete ud.__nocast; else ud.__nocast = m.nocast;
          delete ud.__playSaved;
        }
      }
      carryState.id = null;
    };
  }, [playing, objects]);

  return null;
}