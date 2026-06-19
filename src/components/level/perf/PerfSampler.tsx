import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import { setPerfSnapshot } from "./perfStore";

// In-Canvas component that samples the WebGL renderer 4× per second and
// publishes a snapshot to the perf store. Cheap: a few number reads + an
// EWMA. Rendered as `null` so it adds no objects to the scene graph.
export default function PerfSampler() {
  const gl = useThree((s) => s.gl);
  const last = useRef<number>(performance.now());
  const acc = useRef<{ frames: number; time: number }>({ frames: 0, time: 0 });
  const emaMs = useRef<number>(16.6);
  const lastEmit = useRef<number>(0);

  useFrame(() => {
    const now = performance.now();
    const dt = now - last.current;
    last.current = now;
    // EWMA on frame time for a stable readout
    emaMs.current = emaMs.current * 0.9 + dt * 0.1;
    acc.current.frames += 1;
    acc.current.time += dt;

    if (now - lastEmit.current < 250) return;
    lastEmit.current = now;

    const fps = acc.current.time > 0
      ? Math.round((acc.current.frames * 1000) / acc.current.time)
      : 0;
    acc.current.frames = 0;
    acc.current.time = 0;

    const info = gl.info;
    const memAny = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;

    setPerfSnapshot({
      fps,
      ms: +emaMs.current.toFixed(2),
      calls: info.render.calls,
      tris: info.render.triangles,
      programs: info.programs?.length ?? 0,
      textures: info.memory.textures,
      geometries: info.memory.geometries,
      heapMB: memAny ? +(memAny.usedJSHeapSize / 1_000_000).toFixed(1) : null,
    });
  });

  return null;
}