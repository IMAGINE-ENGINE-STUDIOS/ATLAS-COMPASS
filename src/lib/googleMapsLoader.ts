let loadingPromise: Promise<typeof google> | null = null;

/**
 * Loads the Google Maps JS API exactly once and resolves with the global
 * `google` namespace. Uses the Lovable-managed referrer-restricted browser key.
 */
export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if ((window as any).google?.maps?.Map) return Promise.resolve((window as any).google);
  if (loadingPromise) return loadingPromise;

  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;
  if (!key) return Promise.reject(new Error("Google Maps browser key missing"));

  loadingPromise = new Promise((resolve, reject) => {
    const cbName = "__lovableGmapsReady";
    (window as any)[cbName] = () => {
      try { delete (window as any)[cbName]; } catch {}
      if ((window as any).google?.maps?.Map) resolve((window as any).google);
      else reject(new Error("Google Maps failed to initialise"));
    };
    const s = document.createElement("script");
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=${cbName}${channel ? `&channel=${encodeURIComponent(channel)}` : ""}`;
    s.onerror = () => reject(new Error("Failed to load Google Maps script"));
    document.head.appendChild(s);
  });
  return loadingPromise;
}