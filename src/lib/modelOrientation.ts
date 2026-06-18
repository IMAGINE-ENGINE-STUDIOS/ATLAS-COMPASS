/**
 * Some rigged glTFs are authored facing the camera (+Z toward viewer) rather
 * than the three.js convention of +Z forward. This helper returns the yaw
 * offset (radians) needed so locomotion code that assumes "+Z is forward"
 * renders the mesh facing its real travel direction.
 */
export function modelForwardYawOffset(url: string | null | undefined): number {
  if (!url) return 0;
  const u = url.toLowerCase();
  if (u.includes("soldier.glb")) return Math.PI;
  if (u.includes("michelle.glb")) return Math.PI;
  return 0;
}
