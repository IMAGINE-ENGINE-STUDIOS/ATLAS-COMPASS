/**
 * Planet texture preloader.
 *
 * The `/planet/:id` viewer streams multi-megabyte NASA-derived albedo maps
 * through R3F's `useLoader`, which suspends until the texture decodes. When we
 * fly the camera to a body we warm both caches *during* the flight so the
 * destination scene paints instantly on arrival:
 *  - `useLoader.preload` seeds R3F's loader cache (same key the page reads).
 *  - a real `TextureLoader` promise lets callers await decode completion.
 */
import { useLoader } from "@react-three/fiber";
import { TextureLoader } from "three";
import { findPlanet, type PlanetId } from "@/lib/planets/config";

const inflight = new Map<string, Promise<void>>();

function loadTexture(url: string): Promise<void> {
  const cached = inflight.get(url);
  if (cached) return cached;
  // Seed R3F's cache so <PlanetPage/>'s useLoader resolves without suspending.
  try {
    useLoader.preload(TextureLoader, url);
  } catch {
    /* non-fatal — the page will load it normally */
  }
  const p = new Promise<void>((resolve) => {
    new TextureLoader().load(
      url,
      () => resolve(),
      undefined,
      () => resolve(),
    );
  });
  inflight.set(url, p);
  return p;
}

/** Warm every texture a body's viewer needs. Never rejects. */
export function preloadPlanet(id: PlanetId | string): Promise<void> {
  const planet = findPlanet(String(id));
  if (!planet) return Promise.resolve();
  const urls = [planet.textureUrl, planet.ringUrl].filter(Boolean) as string[];
  return Promise.all(urls.map(loadTexture)).then(() => undefined);
}

/** True once the body's textures have finished decoding at least once. */
export function isPlanetPreloaded(id: PlanetId | string): boolean {
  const planet = findPlanet(String(id));
  return !!planet && inflight.has(planet.textureUrl);
}
