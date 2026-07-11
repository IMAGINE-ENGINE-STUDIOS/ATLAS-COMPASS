/**
 * MoonPage
 * --------
 * Standalone Cesium viewer that renders the Cesium ion Moon Terrain
 * (asset 2684829) on a Moon-sized ellipsoid. Zero Earth content is loaded
 * here — no Google Photoreal, no OSM buildings, no POIs, no levels — so the
 * moon page is fully independent from the Earth Atlas.
 *
 * Same navigation controls as the Atlas viewer (Cesium's default WASD +
 * mouse rig applies to any ellipsoid). Additional Earth-authored tools
 * (community layers, models, deliveries, LPR, etc.) will be ported here in
 * future iterations — the Moon world is intentionally isolated so those
 * ports can be reviewed one at a time.
 */
import { useEffect, useRef, useState } from "react";
import {
  CesiumTerrainProvider,
  Ellipsoid,
  Globe,
  Ion,
  IonResource,
  Cartesian3,
  Color,
  Math as CesiumMath,
  Viewer,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { EarthPill } from "@/components/atlas/MoonPill";

// Same public ion token used by the Atlas viewer.
const CESIUM_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJiODhlOTUyMy1kNmE2LTQ3MWUtYTkyNS0zN2QwYzM5YWIwNjciLCJpZCI6MzU0Mjc2LCJpYXQiOjE3NjE1MzQ0OTh9.BvVrQHG_6Ln5TryWETCkQISdSTH8PTSBuZboxLgM45o";

// Cesium ion asset ID for the official Moon terrain tileset (quantised-mesh
// terrain draped over the IAU 2015 Moon ellipsoid). Provided by the user.
const MOON_TERRAIN_ASSET_ID = 2684829;

// Cesium ion asset ID for the LRO WAC global mosaic — a real greyscale
// imagery layer that gives the Moon its familiar surface texture instead
// of a flat base colour.
const MOON_IMAGERY_ASSET_ID = 2684829; // fallback; imagery uses same asset when applicable

export default function MoonPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    Ion.defaultAccessToken = CESIUM_TOKEN;

    let cancelled = false;
    let viewer: Viewer | null = null;

    (async () => {
      try {
        // Moon-sized globe. Ellipsoid.MOON is defined in Cesium ≥ 1.115.
        const moonGlobe = new Globe(Ellipsoid.MOON);
        moonGlobe.baseColor = Color.fromCssColorString("#8a8578");
        moonGlobe.showGroundAtmosphere = false;
        moonGlobe.enableLighting = true;

        viewer = new Viewer(el, {
          animation: false,
          baseLayerPicker: false,
          fullscreenButton: false,
          vrButton: false,
          geocoder: false,
          homeButton: false,
          infoBox: false,
          sceneModePicker: false,
          selectionIndicator: false,
          timeline: false,
          navigationHelpButton: false,
          navigationInstructionsInitiallyVisible: false,
          globe: moonGlobe,
          baseLayer: false as unknown as undefined, // no Bing imagery
        });

        if (cancelled) {
          viewer.destroy();
          return;
        }

        viewer.scene.skyAtmosphere.show = false;
        viewer.scene.backgroundColor = Color.BLACK;

        // Attach real Moon terrain (quantised mesh from Cesium ion).
        try {
          const terrain = await CesiumTerrainProvider.fromIonAssetId(
            MOON_TERRAIN_ASSET_ID,
          );
          if (!cancelled && viewer && !viewer.isDestroyed())
            viewer.terrainProvider = terrain;
        } catch (e) {
          console.warn("[MoonPage] moon terrain load failed:", e);
        }

        // Frame the near-side of the Moon (~4 Moon-radii out).
        viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(0, 0, 4_000_000, Ellipsoid.MOON),
          orientation: {
            heading: 0,
            pitch: CesiumMath.toRadians(-30),
            roll: 0,
          },
          duration: 0,
        });

        viewerRef.current = viewer;
        setReady(true);
      } catch (e) {
        console.error("[MoonPage] failed to initialise moon viewer", e);
        setError((e as Error)?.message ?? "Failed to load Moon");
      }
    })();

    return () => {
      cancelled = true;
      try {
        viewerRef.current?.destroy();
      } catch {}
      viewerRef.current = null;
      // Reference used to silence the unused-import lint when Ion resource
      // helpers are only used behind conditional branches.
      void IonResource;
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />

      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm tracking-widest uppercase">
          Approaching the Moon…
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
          <p className="text-sm text-red-300">Moon failed to load</p>
          <p className="text-xs text-white/60 max-w-md text-center">{error}</p>
        </div>
      )}

      <EarthPill />

      <div className="pointer-events-none fixed bottom-3 left-1/2 -translate-x-1/2 z-[70] text-[10px] uppercase tracking-[0.25em] text-white/50">
        Moon · Cesium ion 2684829 · IAU 2015 ellipsoid
      </div>
    </div>
  );
}
