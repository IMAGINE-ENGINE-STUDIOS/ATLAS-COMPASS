// CSV format for sharable geometries.
//
// A single .csv file can contain two optional sections, marked by lines that
// start with `#`. Everything before the first section header is also treated
// as the PRIMITIVES section (so the simplest files are just a flat list of
// primitives, no headers needed).
//
// ┌─ # PRIMITIVES ──────────────────────────────────────────────────────────┐
// │ shape,name,x,y,z,sx,sy,sz,rx,ry,rz,color                                │
// │ box,Wall,0,0.5,0,2,1,0.2,0,0,0,#88aaff                                  │
// │ sphere,Ball,1,0.5,1,0.5,0.5,0.5,0,0,0,#ffaa44                           │
// │                                                                         │
// │ shape   ∈ box | sphere | plane | cylinder | cone | torus                │
// │ x y z   = position (metres)                                             │
// │ sx sy sz = scale (metres). Defaults to 1 if blank.                      │
// │ rx ry rz = euler rotation in degrees. Defaults to 0 if blank.           │
// │ color   = hex like #88aaff, optional. Defaults to a neutral blue.       │
// └─────────────────────────────────────────────────────────────────────────┘
//
// ┌─ # MESH (optional) ─────────────────────────────────────────────────────┐
// │ v,x,y,z              ← a vertex                                         │
// │ f,a,b,c              ← a triangle face (1-based vertex indices)         │
// │                                                                         │
// │ Each triangle is spawned as a thin flat polygon (~5 cm thick) so it     │
// │ shows up in the editor without needing a custom mesh kind.              │
// └─────────────────────────────────────────────────────────────────────────┘

import type {
  PrimitiveObject,
  PolygonObject,
  SceneObject,
  Vec3,
  RGBA,
} from "./levelTypes";

export const GEOMETRY_CSV_FORMAT_DOC = `# PRIMITIVES
# shape,name,x,y,z,sx,sy,sz,rx_deg,ry_deg,rz_deg,color
# shape ∈ box | sphere | plane | cylinder | cone | torus
# position in metres · scale defaults to 1 · rotation in degrees · color optional hex
box,Wall,0,0.5,0,2,1,0.2,0,0,0,#88aaff
sphere,Ball,1,0.5,1,0.5,0.5,0.5,0,0,0,#ffaa44

# MESH (optional — each face becomes a thin flat polygon)
# v,x,y,z       — a vertex
# f,a,b,c       — a triangle, 1-based vertex indices
v,0,0,0
v,1,0,0
v,0,0,1
f,1,2,3

# PATHS (optional — named splines you can bind to objects)
# p,pathName,color,closed,triggerRadius   ← declare a path
# wp,pathName,x,y,z                       ← add a waypoint to that path
p,patrol,#22ff88,0,
wp,patrol,0,0.5,0
wp,patrol,4,0.5,0
wp,patrol,4,0.5,4
wp,patrol,0,0.5,4
`;

const PRIMITIVE_SHAPES = ["box", "sphere", "plane", "cylinder", "cone", "torus"] as const;
export type PrimitiveShape = typeof PRIMITIVE_SHAPES[number];

export interface PrimitiveRow {
  shape: PrimitiveShape;
  name?: string;
  position: Vec3;
  scale: Vec3;
  rotationDeg: Vec3;
  color?: string; // hex
}

export interface MeshTriangle {
  a: Vec3;
  b: Vec3;
  c: Vec3;
}

export interface ParsedPath {
  name: string;
  color: string;
  closed: boolean;
  triggerRadius?: number;
  waypoints: Vec3[];
}

export interface ParsedGeometryCsv {
  primitives: PrimitiveRow[];
  triangles: MeshTriangle[];
  paths: ParsedPath[];
  errors: string[];
}

function hexToRgba(hex: string, a = 1): RGBA {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return [0.55, 0.7, 0.95, a];
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
    a,
  ];
}

function rgbaToHex(c: RGBA): string {
  const to = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
  return `#${to(c[0])}${to(c[1])}${to(c[2])}`;
}

const num = (s: string | undefined, d = 0) => {
  if (s === undefined || s === "") return d;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : d;
};

export function parseGeometryCsv(raw: string): ParsedGeometryCsv {
  const out: ParsedGeometryCsv = { primitives: [], triangles: [], paths: [], errors: [] };
  const verts: Vec3[] = [];
  // Track section: default to PRIMITIVES.
  let section: "primitives" | "mesh" | "paths" = "primitives";
  const pathByName = new Map<string, ParsedPath>();

  const lines = raw.split(/\r?\n/);
  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const line = rawLine.trim();
    if (!line) return;
    if (line.startsWith("#")) {
      const head = line.replace(/^#+\s*/, "").toLowerCase();
      if (head.startsWith("primitive")) section = "primitives";
      else if (head.startsWith("mesh")) section = "mesh";
      else if (head.startsWith("path")) section = "paths";
      return; // comments / section headers are skipped
    }
    const cells = line.split(",").map((c) => c.trim());

    if (section === "paths" || cells[0]?.toLowerCase() === "p" || cells[0]?.toLowerCase() === "wp") {
      const kind = cells[0]?.toLowerCase();
      if (kind === "p") {
        const name = cells[1] || `path_${out.paths.length + 1}`;
        const path: ParsedPath = {
          name,
          color: cells[2] || "#22ff88",
          closed: cells[3] === "1" || cells[3]?.toLowerCase() === "true",
          triggerRadius: cells[4] ? num(cells[4]) : undefined,
          waypoints: [],
        };
        pathByName.set(name, path);
        out.paths.push(path);
        return;
      }
      if (kind === "wp") {
        const name = cells[1] || "";
        let p = pathByName.get(name);
        if (!p) {
          p = { name: name || `path_${out.paths.length + 1}`, color: "#22ff88", closed: false, waypoints: [] };
          pathByName.set(p.name, p);
          out.paths.push(p);
        }
        p.waypoints.push([num(cells[2]), num(cells[3]), num(cells[4])]);
        return;
      }
      if (section === "paths") {
        out.errors.push(`Line ${lineNo}: expected p,... or wp,...`);
        return;
      }
    }

    if (section === "mesh") {
      const kind = cells[0]?.toLowerCase();
      if (kind === "v") {
        if (cells.length < 4) { out.errors.push(`Line ${lineNo}: vertex needs x,y,z`); return; }
        verts.push([num(cells[1]), num(cells[2]), num(cells[3])]);
      } else if (kind === "f") {
        if (cells.length < 4) { out.errors.push(`Line ${lineNo}: face needs three indices`); return; }
        const a = parseInt(cells[1], 10);
        const b = parseInt(cells[2], 10);
        const c = parseInt(cells[3], 10);
        const va = verts[a - 1], vb = verts[b - 1], vc = verts[c - 1];
        if (!va || !vb || !vc) { out.errors.push(`Line ${lineNo}: face references missing vertex`); return; }
        out.triangles.push({ a: va, b: vb, c: vc });
      } else {
        out.errors.push(`Line ${lineNo}: expected v,... or f,...`);
      }
      return;
    }

    // PRIMITIVES section
    const shape = cells[0]?.toLowerCase() as PrimitiveShape;
    if (!PRIMITIVE_SHAPES.includes(shape)) {
      out.errors.push(`Line ${lineNo}: unknown shape "${cells[0]}"`);
      return;
    }
    out.primitives.push({
      shape,
      name: cells[1] || shape,
      position: [num(cells[2]), num(cells[3]), num(cells[4])],
      scale: [num(cells[5], 1) || 1, num(cells[6], 1) || 1, num(cells[7], 1) || 1],
      rotationDeg: [num(cells[8]), num(cells[9]), num(cells[10])],
      color: cells[11] || undefined,
    });
  });

  return out;
}

export function serializePrimitives(rows: PrimitiveRow[]): string {
  const header = `# PRIMITIVES\n# shape,name,x,y,z,sx,sy,sz,rx_deg,ry_deg,rz_deg,color\n`;
  const body = rows.map((r) => {
    return [
      r.shape,
      (r.name ?? r.shape).replace(/,/g, " "),
      r.position[0], r.position[1], r.position[2],
      r.scale[0], r.scale[1], r.scale[2],
      r.rotationDeg[0], r.rotationDeg[1], r.rotationDeg[2],
      r.color ?? "",
    ].join(",");
  }).join("\n");
  return header + body + "\n";
}

let __ctr = 0;
const newId = (p: string) =>
  `${p}-${Date.now().toString(36)}-${(__ctr++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const DEG2RAD = Math.PI / 180;

/** Convert parsed CSV into scene objects positioned around the given anchor. */
export function csvToSceneObjects(parsed: ParsedGeometryCsv, anchor: Vec3): SceneObject[] {
  const out: SceneObject[] = [];

  for (const r of parsed.primitives) {
    const color: RGBA = r.color ? hexToRgba(r.color) : [0.55, 0.7, 0.95, 1];
    const obj: PrimitiveObject = {
      id: newId("obj"),
      kind: "primitive",
      shape: r.shape,
      name: r.name ?? (r.shape[0].toUpperCase() + r.shape.slice(1)),
      position: [anchor[0] + r.position[0], anchor[1] + r.position[1], anchor[2] + r.position[2]],
      rotation: [r.rotationDeg[0] * DEG2RAD, r.rotationDeg[1] * DEG2RAD, r.rotationDeg[2] * DEG2RAD],
      scale: r.scale,
      visible: true,
      color,
      metalness: 0.1,
      roughness: 0.6,
    };
    out.push(obj);
  }

  for (const t of parsed.triangles) {
    // Flatten the triangle onto its own local XZ plane: use the centroid as
    // the polygon origin and project the three vertices into XZ at y=0.
    const cx = (t.a[0] + t.b[0] + t.c[0]) / 3;
    const cy = (t.a[1] + t.b[1] + t.c[1]) / 3;
    const cz = (t.a[2] + t.b[2] + t.c[2]) / 3;
    const poly: PolygonObject = {
      id: newId("obj"),
      kind: "polygon",
      name: "Triangle",
      position: [anchor[0] + cx, anchor[1] + cy, anchor[2] + cz],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
      points: [
        [t.a[0] - cx, t.a[2] - cz],
        [t.b[0] - cx, t.b[2] - cz],
        [t.c[0] - cx, t.c[2] - cz],
      ],
      extrude: 0.05,
      bevel: 0,
      closed: true,
      fillColor: [0.6, 0.7, 0.9, 1],
      sideColor: [0.5, 0.55, 0.7, 1],
      topColor: [0.7, 0.75, 0.95, 1],
    };
    out.push(poly);
  }

  return out;
}

/** Export a single placed primitive back to a CSV row, suitable for saving. */
export function sceneObjectsToCsv(objs: SceneObject[]): string {
  const rows: PrimitiveRow[] = [];
  for (const o of objs) {
    if (o.kind !== "primitive") continue;
    rows.push({
      shape: o.shape,
      name: o.name,
      position: o.position,
      scale: o.scale,
      rotationDeg: [o.rotation[0] / DEG2RAD, o.rotation[1] / DEG2RAD, o.rotation[2] / DEG2RAD],
      color: rgbaToHex(o.color),
    });
  }
  return serializePrimitives(rows);
}

export const PRIMITIVE_SHAPE_LIST = PRIMITIVE_SHAPES;