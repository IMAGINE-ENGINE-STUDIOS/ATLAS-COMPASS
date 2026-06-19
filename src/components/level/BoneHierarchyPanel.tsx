import { useMemo, useState } from "react";
import { Search, ChevronRight, ChevronDown, Bone as BoneIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

function prettifyBoneName(name: string): string {
  return name
    .replace(/^mixamorig:?/i, "")
    .replace(/[_\-:]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

interface BoneNode {
  name: string;
  depth: number;
  children: BoneNode[];
}

function buildBoneTree(bones: { name: string; parentName: string | null }[]): BoneNode[] {
  const map = new Map<string, BoneNode>();
  bones.forEach((b) => map.set(b.name, { name: b.name, children: [], depth: 0 }));
  const roots: BoneNode[] = [];
  bones.forEach((b) => {
    const node = map.get(b.name)!;
    if (b.parentName && map.has(b.parentName)) {
      const pn = map.get(b.parentName)!;
      node.depth = pn.depth + 1;
      pn.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const fix = (n: BoneNode, d: number) => { n.depth = d; n.children.forEach((c) => fix(c, d + 1)); };
  roots.forEach((r) => fix(r, 0));
  return roots;
}

export default function BoneHierarchyPanel({
  bones,
  selectedBoneName,
  onSelect,
}: {
  bones: { name: string; parentName: string | null }[];
  selectedBoneName: string | null;
  onSelect: (n: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildBoneTree(bones), [bones]);

  const q = query.trim().toLowerCase();
  const matches = (name: string) =>
    !q || name.toLowerCase().includes(q) || prettifyBoneName(name).toLowerCase().includes(q);

  const effectiveCollapsed = q ? new Set<string>() : collapsed;

  const toggle = (name: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const subtreeMatches = (node: BoneNode): boolean =>
    matches(node.name) || node.children.some(subtreeMatches);

  const renderNode = (node: BoneNode): JSX.Element | null => {
    if (q && !subtreeMatches(node)) return null;
    const isCollapsed = effectiveCollapsed.has(node.name);
    const isSel = selectedBoneName === node.name;
    const hit = q && matches(node.name);
    return (
      <div key={node.name} style={{ paddingLeft: node.depth * 10 }}>
        <div
          className={`group flex items-center gap-1 pl-1 pr-2 py-0.5 rounded text-[11px] font-mono ${
            isSel ? "bg-[rgba(34,255,136,0.18)] text-[#bbffd5]" : "hover:bg-muted/30 text-muted-foreground"
          }`}
        >
          {node.children.length > 0 ? (
            <button
              onClick={() => toggle(node.name)}
              className="text-muted-foreground hover:text-foreground shrink-0"
              title={isCollapsed ? "Expand" : "Collapse"}
            >
              {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          ) : (
            <span className="w-3 h-3 shrink-0" />
          )}
          <button
            onClick={() => onSelect(node.name)}
            className={`flex-1 min-w-0 text-left truncate ${
              hit ? "text-[#22ff88]" : ""
            }`}
            title={node.name}
          >
            {node.name}
          </button>
        </div>
        {!isCollapsed && node.children.length > 0 && (
          <div>{node.children.map(renderNode)}</div>
        )}
      </div>
    );
  };

  return (
    <div
      className="rounded-md border p-2 space-y-1.5"
      style={{
        background: "linear-gradient(180deg, rgba(34,255,136,0.04), rgba(34,255,136,0.01))",
        borderColor: "rgba(34,255,136,0.25)",
      }}
    >
      <div className="flex items-center justify-between px-0.5">
        <span
          className="text-[10px] uppercase tracking-[0.22em] font-semibold flex items-center gap-1"
          style={{ color: "#22ff88" }}
        >
          <BoneIcon className="w-3 h-3" /> Hierarchy · {bones.length}
        </span>
        {query && (
          <button
            onClick={() => setQuery("")}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            clear
          </button>
        )}
      </div>
      <div className="relative">
        <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bones…"
          className="h-7 pl-7 text-[11px]"
        />
      </div>
      <ScrollArea className="h-56 -mx-0.5">
        <div className="pr-1">
          {tree.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic px-2 py-2">Loading rig…</p>
          ) : (
            tree.map(renderNode)
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
