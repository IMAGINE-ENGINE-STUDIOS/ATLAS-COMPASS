import { useEffect, useRef, useState } from "react";
import {
  Viewer, UrlTemplateImageryProvider, ImageryLayer, EllipsoidTerrainProvider,
  SceneMode, Cartesian3, Cartographic, Math as CesiumMath, Color,
  ScreenSpaceEventHandler, ScreenSpaceEventType, defined, Rectangle,
  VerticalOrigin, HorizontalOrigin, NearFarScalar, LabelStyle, Cartesian2,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { supabase } from "@/integrations/supabase/client";

interface AtlasMiniMapProps {
  lat: number;
  lng: number;
  /** Called when the user drags / clicks the marker. */
  onChange?: (lat: number, lng: number) => void;
  /** Optional Tailwind classes for the container. */
  className?: string;
  /** Map zoom — defaults to 14 for a neighbourhood-level view. */
  zoom?: number;
  /** Disable user interaction (pan / drag). */
  readOnly?: boolean;
  /** When set, that placement id is excluded from the "existing levels"
   *  overlay (so a level isn't drawn on top of its own draggable pin). */
  excludeLevelId?: string;
}

interface OtherPlacement {
  id: string;
  level_id: string;
  lat: number;
  lng: number;
  name: string | null;
}

/** Inline SVG → data URL for billboard pins, so no extra assets are needed. */
const pinSvg = (fill: string, stroke: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="52" viewBox="0 0 40 52">
  <defs>
    <filter id="g" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2"/>
    </filter>
  </defs>
  <ellipse cx="20" cy="48" rx="8" ry="2.5" fill="rgba(0,0,0,0.55)" filter="url(#g)"/>
  <path d="M20 2 C9.5 2 2 10 2 20 c0 12 14 24 18 28 c4 -4 18 -16 18 -28 C38 10 30.5 2 20 2 Z"
        fill="${fill}" stroke="${stroke}" stroke-width="2"/>
  <circle cx="20" cy="20" r="6" fill="rgba(255,255,255,0.95)"/>
</svg>`)}`;

const CURRENT_PIN = pinSvg("hsl(0,85%,55%)", "hsl(0,0%,100%)");
const LEVEL_PIN = pinSvg("hsl(160,90%,45%)", "hsl(160,30%,15%)");

/**
 * Atlas-style satellite mini-map (Cesium in 2D mode with ESRI World Imagery).
 * Renders the current draggable pin AND every other existing level placement
 * pulled live from `atlas_level_placements`.
 */
export default function AtlasMiniMap({
  lat, lng, onChange, className, zoom = 14, readOnly, excludeLevelId,
}: AtlasMiniMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const markerRef = useRef<any>(null);
  const otherEntitiesRef = useRef<any[]>([]);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [others, setOthers] = useState<OtherPlacement[]>([]);

  // Load existing level placements + subscribe.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("atlas_level_placements")
        .select("id,level_id,lat,lng,levels(name)");
      if (cancelled) return;
      const rows: OtherPlacement[] = (data ?? []).map((r: any) => ({
        id: r.id,
        level_id: r.level_id,
        lat: r.lat,
        lng: r.lng,
        name: r.levels?.name ?? null,
      }));
      setOthers(rows);
    };
    load();
    const ch = supabase
      .channel("atlas-minimap-placements")
      .on("postgres_changes", { event: "*", schema: "public", table: "atlas_level_placements" }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, []);

  // Initialise the Cesium viewer once.
  useEffect(() => {
    if (!hostRef.current) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const imagery = new UrlTemplateImageryProvider({
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      maximumLevel: 19,
      credit: "Esri, Maxar, Earthstar Geographics",
    });

    const viewer = new Viewer(hostRef.current, {
      baseLayer: new ImageryLayer(imagery, {}),
      terrainProvider: new EllipsoidTerrainProvider(),
      sceneMode: SceneMode.SCENE2D,
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      creditContainer: document.createElement("div"),
    });

    viewer.scene.backgroundColor = Color.fromCssColorString("#0a0a1a");
    viewer.scene.skyAtmosphere && (viewer.scene.skyAtmosphere.show = false);
    viewer.scene.globe.baseColor = Color.fromCssColorString("#0a0a1a");
    viewer.scene.screenSpaceCameraController.enableTilt = false;
    viewer.scene.screenSpaceCameraController.enableRotate = !readOnly;
    viewer.scene.screenSpaceCameraController.enableZoom = !readOnly;
    viewer.scene.screenSpaceCameraController.enableTranslate = !readOnly;
    viewer.scene.screenSpaceCameraController.enableLook = false;

    // Frame to roughly the requested zoom level (relative range in metres).
    const range = 40075000 / Math.pow(2, zoom);
    viewer.camera.flyTo({
      destination: Rectangle.fromDegrees(
        lng - range / 222000, lat - range / 222000,
        lng + range / 222000, lat + range / 222000,
      ),
      duration: 0,
    });

    // Current draggable pin.
    const marker = viewer.entities.add({
      id: "atlas-minimap-current",
      position: Cartesian3.fromDegrees(lng, lat),
      billboard: {
        image: CURRENT_PIN,
        width: 32,
        height: 42,
        verticalOrigin: VerticalOrigin.BOTTOM,
        horizontalOrigin: HorizontalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new NearFarScalar(1e3, 1.0, 1e7, 0.8),
      },
    });
    markerRef.current = marker;

    // Pointer handler for drag/click.
    if (!readOnly) {
      const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
      let dragging = false;
      const pickLatLng = (sp: { x: number; y: number }) => {
        const ray = viewer.camera.getPickRay(new Cartesian2(sp.x, sp.y));
        if (!ray) return null;
        const cart = viewer.scene.globe.pick(ray, viewer.scene);
        if (!defined(cart)) return null;
        const c = Cartographic.fromCartesian(cart as Cartesian3);
        return { lat: CesiumMath.toDegrees(c.latitude), lng: CesiumMath.toDegrees(c.longitude) };
      };
      handler.setInputAction((click: any) => {
        const picked = viewer.scene.pick(click.position);
        if (defined(picked) && picked?.id?.id === "atlas-minimap-current") {
          dragging = true;
          viewer.scene.screenSpaceCameraController.enableInputs = false;
        }
      }, ScreenSpaceEventType.LEFT_DOWN);
      handler.setInputAction((move: any) => {
        if (!dragging) return;
        const ll = pickLatLng(move.endPosition);
        if (!ll) return;
        marker.position = Cartesian3.fromDegrees(ll.lng, ll.lat) as any;
      }, ScreenSpaceEventType.MOUSE_MOVE);
      handler.setInputAction((up: any) => {
        if (dragging) {
          dragging = false;
          viewer.scene.screenSpaceCameraController.enableInputs = true;
          const ll = pickLatLng(up.position);
          if (ll) onChangeRef.current?.(ll.lat, ll.lng);
          return;
        }
        // Plain click anywhere → move pin there.
        const ll = pickLatLng(up.position);
        if (ll) {
          marker.position = Cartesian3.fromDegrees(ll.lng, ll.lat) as any;
          onChangeRef.current?.(ll.lat, ll.lng);
        }
      }, ScreenSpaceEventType.LEFT_UP);
      handlerRef.current = handler;
    }

    viewerRef.current = viewer;

    return () => {
      try { handlerRef.current?.destroy(); } catch {}
      handlerRef.current = null;
      try { if (!viewer.isDestroyed()) viewer.destroy(); } catch {}
      viewerRef.current = null;
      markerRef.current = null;
      otherEntitiesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync controlled coords → marker.
  useEffect(() => {
    const viewer = viewerRef.current;
    const marker = markerRef.current;
    if (!viewer || viewer.isDestroyed() || !marker) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    marker.position = Cartesian3.fromDegrees(lng, lat) as any;
  }, [lat, lng]);

  // Render other-level pins as Cesium entities.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    otherEntitiesRef.current.forEach((e) => { try { viewer.entities.remove(e); } catch {} });
    otherEntitiesRef.current = [];
    others
      .filter((p) => !excludeLevelId || p.level_id !== excludeLevelId)
      .forEach((p) => {
        const ent = viewer.entities.add({
          id: `mini-other-${p.id}`,
          position: Cartesian3.fromDegrees(p.lng, p.lat),
          billboard: {
            image: LEVEL_PIN,
            width: 22,
            height: 28,
            verticalOrigin: VerticalOrigin.BOTTOM,
            horizontalOrigin: HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: p.name ? {
            text: p.name,
            font: "11px Inter, sans-serif",
            fillColor: Color.WHITE,
            outlineColor: Color.fromCssColorString("rgba(0,0,0,0.85)"),
            outlineWidth: 3,
            style: LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cartesian2(0, -32),
            verticalOrigin: VerticalOrigin.BOTTOM,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            translucencyByDistance: new NearFarScalar(1e3, 1.0, 5e5, 0.0),
          } : undefined,
        });
        otherEntitiesRef.current.push(ent);
      });
  }, [others, excludeLevelId]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return (
      <div className={`${className ?? ""} grid place-items-center bg-white/5 text-[11px] text-muted-foreground`}>
        Enter valid coordinates
      </div>
    );
  }
  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={hostRef} className="absolute inset-0" />
      {/* Atlas-style corner badge */}
      <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/55 backdrop-blur-md border border-white/10 text-[9px] font-medium tracking-wider uppercase text-white/80 pointer-events-none">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Atlas
      </div>
      {others.length > 0 && (
        <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/55 backdrop-blur-md border border-white/10 text-[9px] text-white/70 pointer-events-none">
          {others.length} level{others.length === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}