/**
 * Camera Recordings Manager — a singleton store that captures live traffic-camera
 * feeds (image or video stream) into WebM blobs via canvas.captureStream +
 * MediaRecorder. Recordings keep running even after the viewer popup is closed,
 * support pause/resume, have no built-in time limit, and are listed in the
 * Recordings Gallery.
 */

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-camera-image`;

export type RecordingState = "recording" | "paused" | "finished";

export interface CameraRecording {
  id: string;
  cameraId: string;
  cameraName: string;
  source: string;
  isStream: boolean;
  startedAt: number;
  durationSec: number;
  sizeBytes: number;
  state: RecordingState;
  mime: string;
  blobUrl?: string;
  blob?: Blob;
  thumbnail?: string;
}

interface InternalEntry extends CameraRecording {
  recorder: MediaRecorder | null;
  chunks: Blob[];
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  raf: number | null;
  durationTimer: ReturnType<typeof setInterval> | null;
  imgEl: HTMLImageElement | null;
  videoEl: HTMLVideoElement | null;
  imgRefreshTimer: ReturnType<typeof setInterval> | null;
}

type Listener = () => void;

function isStreamUrl(url?: string) {
  if (!url) return false;
  return /\.(mjpg|mjpeg|mp4|m3u8)(\?|$)|mjpeg|mjpg|\.stream|hls|playlist\.m3u/i.test(url);
}

function sanitize(name: string) {
  return name.replace(/[^a-z0-9\-_]+/gi, "_").slice(0, 60);
}

class CameraRecordingsManager {
  private entries = new Map<string, InternalEntry>();
  private listeners = new Set<Listener>();

  subscribe(cb: Listener) {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private notify() {
    this.listeners.forEach(l => { try { l(); } catch {} });
  }

  list(): CameraRecording[] {
    return Array.from(this.entries.values())
      .map(({ recorder: _r, chunks: _c, canvas: _ca, ctx: _ctx, raf: _ra, durationTimer: _d, imgEl: _i, videoEl: _v, imgRefreshTimer: _t, ...pub }) => pub)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  activeForCamera(cameraId: string): CameraRecording | undefined {
    return this.list().find(r => r.cameraId === cameraId && r.state !== "finished");
  }

  count(): number { return this.entries.size; }

  /**
   * Start a new recording for the given camera. Returns the recording id.
   * If a recording for the same camera is already active, it is returned as-is.
   */
  start(camera: {
    id: string;
    name: string;
    source: string;
    imageUrl: string;
    streamUrl?: string;
    refreshRate?: number;
  }): string | null {
    const existing = this.activeForCamera(camera.id);
    if (existing) return existing.id;

    const isStream = isStreamUrl(camera.streamUrl);
    const id = `${camera.id}-${Date.now()}`;
    const canvas = document.createElement("canvas");
    canvas.width = 1280; canvas.height = 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const entry: InternalEntry = {
      id,
      cameraId: camera.id,
      cameraName: camera.name,
      source: camera.source,
      isStream,
      startedAt: Date.now(),
      durationSec: 0,
      sizeBytes: 0,
      state: "recording",
      mime: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm",
      recorder: null,
      chunks: [],
      canvas,
      ctx,
      raf: null,
      durationTimer: null,
      imgEl: null,
      videoEl: null,
      imgRefreshTimer: null,
    };

    // Build off-DOM source element
    if (isStream && camera.streamUrl) {
      const v = document.createElement("video");
      v.src = camera.streamUrl;
      v.crossOrigin = "anonymous";
      v.autoplay = true;
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.play().catch(() => {});
      v.addEventListener("loadedmetadata", () => {
        canvas.width = v.videoWidth || 1280;
        canvas.height = v.videoHeight || 720;
      });
      entry.videoEl = v;
    } else {
      const img = document.createElement("img");
      img.crossOrigin = "anonymous";
      const refresh = () => {
        img.src = `${PROXY_URL}?url=${encodeURIComponent(camera.imageUrl)}&_t=${Date.now()}`;
      };
      img.addEventListener("load", () => {
        if (img.naturalWidth) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
        }
      });
      refresh();
      const rate = Math.max(camera.refreshRate ?? 10, 1) * 1000;
      entry.imgRefreshTimer = setInterval(refresh, rate);
      entry.imgEl = img;
    }

    // RAF draw loop
    const draw = () => {
      try {
        if (entry.videoEl && entry.videoEl.readyState >= 2) {
          ctx.drawImage(entry.videoEl, 0, 0, canvas.width, canvas.height);
        } else if (entry.imgEl && entry.imgEl.complete && entry.imgEl.naturalWidth > 0) {
          ctx.drawImage(entry.imgEl, 0, 0, canvas.width, canvas.height);
        }
      } catch {}
      entry.raf = requestAnimationFrame(draw);
    };
    draw();

    // Recorder
    const fps = isStream ? 30 : 5;
    const mediaStream = (canvas as any).captureStream(fps) as MediaStream;
    const rec = new MediaRecorder(mediaStream, { mimeType: entry.mime, videoBitsPerSecond: 2_500_000 });
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) {
        entry.chunks.push(e.data);
        entry.sizeBytes += e.data.size;
        this.notify();
      }
    };
    rec.onstop = () => {
      const blob = new Blob(entry.chunks, { type: entry.mime });
      entry.blob = blob;
      entry.blobUrl = URL.createObjectURL(blob);
      entry.state = "finished";
      // Capture final thumbnail
      try { entry.thumbnail = canvas.toDataURL("image/jpeg", 0.55); } catch {}
      this.cleanupSources(entry);
      this.notify();
    };
    entry.recorder = rec;
    rec.start(1000);

    // Duration ticker — only advances while actively recording
    entry.durationTimer = setInterval(() => {
      if (entry.state === "recording") {
        entry.durationSec += 1;
        this.notify();
      }
    }, 1000);

    this.entries.set(id, entry);
    this.notify();
    return id;
  }

  pause(id: string) {
    const e = this.entries.get(id);
    if (!e || !e.recorder || e.state !== "recording") return;
    try { e.recorder.pause(); } catch {}
    e.state = "paused";
    if (e.videoEl) try { e.videoEl.pause(); } catch {}
    this.notify();
  }

  resume(id: string) {
    const e = this.entries.get(id);
    if (!e || !e.recorder || e.state !== "paused") return;
    try { e.recorder.resume(); } catch {}
    e.state = "recording";
    if (e.videoEl) try { e.videoEl.play().catch(() => {}); } catch {}
    this.notify();
  }

  stop(id: string) {
    const e = this.entries.get(id);
    if (!e || !e.recorder) return;
    if (e.recorder.state !== "inactive") {
      try { e.recorder.stop(); } catch {}
    }
    // onstop will flip state to finished + notify
  }

  /** Stops the active recording for a camera (if any). */
  stopForCamera(cameraId: string) {
    const r = this.activeForCamera(cameraId);
    if (r) this.stop(r.id);
  }

  remove(id: string) {
    const e = this.entries.get(id);
    if (!e) return;
    if (e.state !== "finished") this.stop(id);
    if (e.blobUrl) URL.revokeObjectURL(e.blobUrl);
    this.cleanupSources(e);
    this.entries.delete(id);
    this.notify();
  }

  download(id: string) {
    const e = this.entries.get(id);
    if (!e || !e.blob) return;
    const a = document.createElement("a");
    const url = e.blobUrl ?? URL.createObjectURL(e.blob);
    a.href = url;
    a.download = `${sanitize(e.cameraName)}_${new Date(e.startedAt).toISOString().replace(/[:.]/g, "-")}.webm`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  private cleanupSources(e: InternalEntry) {
    if (e.raf) cancelAnimationFrame(e.raf);
    e.raf = null;
    if (e.durationTimer) clearInterval(e.durationTimer);
    e.durationTimer = null;
    if (e.imgRefreshTimer) clearInterval(e.imgRefreshTimer);
    e.imgRefreshTimer = null;
    if (e.videoEl) { try { e.videoEl.pause(); e.videoEl.src = ""; e.videoEl.load(); } catch {} }
    e.videoEl = null;
    if (e.imgEl) { try { e.imgEl.src = ""; } catch {} }
    e.imgEl = null;
  }
}

export const cameraRecordings = new CameraRecordingsManager();

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}