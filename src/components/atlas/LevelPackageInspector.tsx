/**
 * LevelPackageInspector
 * ---------------------
 * Read-only inspector for a placement's snapshotted Manifest and Package.
 * Renders two collapsible panels:
 *   • Manuscript  — the rules that govern the level volume (10 km cap).
 *   • Package     — content-addressed asset index with sha / size / kind.
 *
 * Both views are sourced from the placement row (manifest_snapshot +
 * package_storage_path). The package itself is fetched on demand so the
 * panel is cheap to render even when many placements exist.
 */

import { useMemo } from "react";
import { Scroll, Package as PackageIcon, Loader2, ShieldAlert } from "lucide-react";
import type { LevelManifest } from "@/lib/levelManifest";
import { LEVEL_VOLUME_CEILING_M, validateManifest } from "@/lib/levelManifest";
import { useLevelPackage } from "@/lib/useLevelPackage";

interface Props {
  manifest: LevelManifest | null;
  packageStoragePath: string | null;
}

export default function LevelPackageInspector({ manifest, packageStoragePath }: Props) {
  const issues = useMemo(() => (manifest ? validateManifest(manifest) : []), [manifest]);
  const { pkg, loading, error } = useLevelPackage(packageStoragePath);

  return (
    <div className="space-y-3">
      {/* Manuscript */}
      <section className="rounded-lg border border-emerald-400/20 bg-white/[0.02] p-3">
        <header className="flex items-center gap-2 mb-2">
          <Scroll className="w-3.5 h-3.5 text-emerald-300" />
          <div className="text-[11px] uppercase tracking-wider text-white/70">Manuscript</div>
        </header>
        {!manifest ? (
          <p className="text-[11px] text-white/55">
            No manifest yet — this level was placed before manifests existed.
            Repackage from the editor to attach one.
          </p>
        ) : (
          <div className="text-[11px] space-y-1.5">
            <Row k="Volume" v={describeVolume(manifest)} />
            <Row k="Ceiling" v={`${Math.min(manifest.volume.ceilingM, LEVEL_VOLUME_CEILING_M)} m`} />
            <Row k="Gravity" v={`${manifest.rules.physics.gravity} m/s²`} />
            <Row k="Locomotion" v={`${manifest.rules.locomotion.defaultMode} · ×${manifest.rules.locomotion.speedMul}`} />
            <Row k="Camera" v={`${manifest.rules.camera.minZoomM}–${manifest.rules.camera.maxZoomM} m${manifest.rules.camera.allowFreeFly ? " · free-fly" : ""}`} />
            <Row k="Weather" v={manifest.rules.weather.override ?? "ambient"} />
            <Row k="Time" v={manifest.rules.time.lockTimeOfDay != null ? `locked ${manifest.rules.time.lockTimeOfDay}h` : `×${manifest.rules.time.timeScale}`} />
            <Row k="Shadows" v={manifest.rules.rendering.shadowQuality} />
            <Row k="Network" v={manifest.rules.network.multiplayer ? `multi · ${manifest.rules.network.maxPlayers}` : "single"} />
            <Row k="Access" v={`${manifest.rules.access.visibility}${manifest.rules.access.allowEdits ? " · editable" : ""}`} />
            {issues.length > 0 && (
              <div className="mt-2 flex items-start gap-1.5 rounded bg-red-500/10 border border-red-400/30 p-1.5 text-red-200">
                <ShieldAlert className="w-3 h-3 mt-0.5" />
                <ul className="list-disc pl-3">
                  {issues.map((i) => <li key={i}>{i}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Package */}
      <section className="rounded-lg border border-emerald-400/20 bg-white/[0.02] p-3">
        <header className="flex items-center gap-2 mb-2">
          <PackageIcon className="w-3.5 h-3.5 text-emerald-300" />
          <div className="text-[11px] uppercase tracking-wider text-white/70">Package</div>
        </header>
        {!packageStoragePath ? (
          <p className="text-[11px] text-white/55">
            This placement was created before packaging existed. New uploads
            will ship as <span className="font-mono">.lvlpkg</span> bundles.
          </p>
        ) : loading ? (
          <div className="text-[11px] text-white/60 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Streaming package…
          </div>
        ) : error ? (
          <div className="text-[11px] text-red-300">Failed: {error}</div>
        ) : pkg ? (
          <div className="text-[11px] space-y-1">
            <Row k="Package id" v={pkg.index.packageId.slice(0, 8) + "…"} />
            <Row k="Version" v={pkg.index.packageVersion} />
            <Row k="Files" v={String(pkg.index.entries.length)} />
            <Row k="Total size" v={formatBytes(pkg.index.entries.reduce((s, e) => s + e.size, 0))} />
            <details className="mt-1">
              <summary className="cursor-pointer text-white/60 hover:text-white">Browse contents</summary>
              <ul className="mt-1 max-h-40 overflow-y-auto font-mono space-y-0.5">
                {pkg.index.entries.map((e) => (
                  <li key={e.path} className="flex items-center justify-between gap-2">
                    <span className="truncate text-white/80">{e.path}</span>
                    <span className="text-white/40">{formatBytes(e.size)}</span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-white/60">{k}</span>
      <span className="font-mono text-white/90 truncate max-w-[60%] text-right">{v}</span>
    </div>
  );
}

function describeVolume(m: LevelManifest): string {
  if (m.volume.shape === "circle" && m.volume.center) {
    return `circle · r=${m.volume.radiusM ?? 0}m`;
  }
  return `polygon · ${m.volume.points?.length ?? 0} pts`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}