/**
 * Draws the streamed telescope cutout over the Cesium canvas.
 *
 * A TAN cutout is a pinhole projection, so when its field matches the frustum
 * it lines up pixel-for-pixel with the sky behind it. The image is centred,
 * rolled to put celestial north where the camera sees it, and cross-faded in.
 */
import type { DeepFieldFrame } from "@/lib/sky/deepField";

interface Props {
  frame: DeepFieldFrame | null;
  opacity?: number;
}

export default function DeepFieldOverlay({ frame, opacity = 1 }: Props) {
  if (!frame) return null;
  return (
    <div className="fixed inset-0 z-[60] pointer-events-none overflow-hidden">
      <img
        key={frame.url}
        src={frame.url}
        alt=""
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: frame.size,
          height: frame.size,
          transform: `translate(-50%, -50%) rotate(${frame.roll}deg)`,
          opacity,
          mixBlendMode: "screen",
        }}
        className="animate-in fade-in duration-500"
      />
    </div>
  );
}
