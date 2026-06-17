import atlasImg      from "@/assets/icons/atlas.png";
import spaceshipImg  from "@/assets/icons/spaceship.png";
import voxelImg      from "@/assets/icons/voxel.png";
import brushImg      from "@/assets/icons/brush.png";
import poiImg        from "@/assets/icons/poi.png";
import routeImg      from "@/assets/icons/route.png";
import marketImg     from "@/assets/icons/market.png";
import paymentsImg   from "@/assets/icons/payments.png";
import signalImg     from "@/assets/icons/signal.png";
import graphImg      from "@/assets/icons/graph.png";
import compassImg    from "@/assets/icons/compass.png";
import droneImg      from "@/assets/icons/drone.png";
import cargoImg      from "@/assets/icons/cargo.png";
import telemetryImg  from "@/assets/icons/telemetry.png";
import networkImg    from "@/assets/icons/network.png";
import layersImg     from "@/assets/icons/layers.png";
import speedImg      from "@/assets/icons/speed.png";
import terrainImg    from "@/assets/icons/terrain.png";
import cameraImg     from "@/assets/icons/camera.png";
import heatImg       from "@/assets/icons/heat.png";

export const GLYPHS = {
  atlas: atlasImg, spaceship: spaceshipImg, voxel: voxelImg, brush: brushImg,
  poi: poiImg, route: routeImg, market: marketImg, payments: paymentsImg,
  signal: signalImg, graph: graphImg, compass: compassImg, drone: droneImg,
  cargo: cargoImg, telemetry: telemetryImg, network: networkImg, layers: layersImg,
  speed: speedImg, terrain: terrainImg, camera: cameraImg, heat: heatImg,
} as const;

export type GlyphName = keyof typeof GLYPHS;

type Props = {
  name: GlyphName;
  alt?: string;
  className?: string;
  /** Optional hex used as a colored drop-shadow glow (icon stays white). */
  glow?: string;
};

/**
 * Atlas glyph icon: bold solid-white silhouette PNG.
 * Default sizing is responsive — 14px on mobile, 16px on sm+.
 * Override via Tailwind w-/h- in `className`.
 */
export default function GlyphIcon({ name, alt, className, glow }: Props) {
  return (
    <img
      src={GLYPHS[name]}
      alt={alt ?? name}
      width={32}
      height={32}
      loading="lazy"
      draggable={false}
      className={
        "inline-block shrink-0 object-contain select-none w-3.5 h-3.5 sm:w-4 sm:h-4 " +
        (className ?? "")
      }
      style={
        glow
          ? { filter: `drop-shadow(0 0 4px ${glow}aa) drop-shadow(0 0 1px ${glow})` }
          : undefined
      }
    />
  );
}