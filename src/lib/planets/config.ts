/**
 * Public planet catalog powering the top-center planet switcher and the
 * `/planet/:id` sphere viewer.  Textures come from Solar System Scope,
 * whose CC-BY 4.0 assets are NASA-derived and available at the highest
 * public resolution (8K for the inner + gas giants, 2K for the ice giants).
 */
export type PlanetId =
  | "sun"
  | "mercury"
  | "venus"
  | "earth"
  | "moon"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune";

export interface PlanetEntry {
  id: PlanetId;
  name: string;
  color: string;
  /** Best-available NASA-derived albedo texture, CORS-enabled. */
  textureUrl: string;
  /** Optional ring texture (Saturn). */
  ringUrl?: string;
  /** Route to fly to when the chip is clicked. */
  route: string;
  /** Equatorial radius in km — for the sphere viewer scale. */
  radiusKm: number;
  /** Short blurb rendered under the chip. */
  blurb: string;
}

const TEX = "https://www.solarsystemscope.com/textures/download";

export const PLANETS: PlanetEntry[] = [
  {
    id: "sun",
    name: "Sun",
    color: "#f59e0b",
    textureUrl: `${TEX}/8k_sun.jpg`,
    route: "/planet/sun",
    radiusKm: 696_340,
    blurb: "G2V star · NASA SDO composite",
  },
  {
    id: "mercury",
    name: "Mercury",
    color: "#a8a29e",
    textureUrl: `${TEX}/8k_mercury.jpg`,
    route: "/planet/mercury",
    radiusKm: 2_439.7,
    blurb: "MESSENGER MDIS mosaic",
  },
  {
    id: "venus",
    name: "Venus",
    color: "#facc15",
    textureUrl: `${TEX}/8k_venus_surface.jpg`,
    route: "/planet/venus",
    radiusKm: 6_051.8,
    blurb: "Magellan radar surface",
  },
  {
    id: "earth",
    name: "Earth",
    color: "#38bdf8",
    textureUrl: `${TEX}/8k_earth_daymap.jpg`,
    route: "/atlas",
    radiusKm: 6_371,
    blurb: "Atlas — live Earth command",
  },
  {
    id: "moon",
    name: "Moon",
    color: "#e5e7eb",
    textureUrl: `${TEX}/8k_moon.jpg`,
    route: "/moon",
    radiusKm: 1_737.4,
    blurb: "LRO WAC + NASA Trek",
  },
  {
    id: "mars",
    name: "Mars",
    color: "#ef4444",
    textureUrl: `${TEX}/8k_mars.jpg`,
    route: "/mars",
    radiusKm: 3_389.5,
    blurb: "Viking MDIM + NASA Trek",
  },
  {
    id: "jupiter",
    name: "Jupiter",
    color: "#f97316",
    textureUrl: `${TEX}/8k_jupiter.jpg`,
    route: "/planet/jupiter",
    radiusKm: 69_911,
    blurb: "Cassini + Juno composite",
  },
  {
    id: "saturn",
    name: "Saturn",
    color: "#fbbf24",
    textureUrl: `${TEX}/8k_saturn.jpg`,
    ringUrl: `${TEX}/8k_saturn_ring_alpha.png`,
    route: "/planet/saturn",
    radiusKm: 58_232,
    blurb: "Cassini ISS + rings",
  },
  {
    id: "uranus",
    name: "Uranus",
    color: "#67e8f9",
    textureUrl: `${TEX}/2k_uranus.jpg`,
    route: "/planet/uranus",
    radiusKm: 25_362,
    blurb: "Voyager 2 flyby",
  },
  {
    id: "neptune",
    name: "Neptune",
    color: "#3b82f6",
    textureUrl: `${TEX}/2k_neptune.jpg`,
    route: "/planet/neptune",
    radiusKm: 24_622,
    blurb: "Voyager 2 imaging",
  },
];

export function findPlanet(id: string): PlanetEntry | undefined {
  return PLANETS.find((p) => p.id === id);
}