import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installDraggableWindows } from "./lib/draggableWindows";

createRoot(document.getElementById("root")!).render(<App />);

installDraggableWindows();

// Register the tile cache service worker so high-resolution 3D tiles, imagery,
// and Google Photoreal responses are served instantly on revisit within the
// session (and across reloads). Cache-first with background revalidation.
if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/tiles-sw.js", { scope: "/" })
      .catch((err) => console.warn("[tiles-sw] registration failed", err));
    // Ask the browser to make our CacheStorage persistent so 3D tiles and
    // imagery survive across reloads and don't get evicted under memory
    // pressure. Grants silently on installed PWAs / engaged sites.
    if (navigator.storage?.persist) {
      navigator.storage.persist().then((granted) => {
        if (granted) console.info("[tiles-sw] persistent storage granted");
      }).catch(() => {});
    }
  });
}
