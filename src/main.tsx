import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Register the tile cache service worker so high-resolution 3D tiles, imagery,
// and Google Photoreal responses are served instantly on revisit within the
// session (and across reloads). Cache-first with background revalidation.
if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/tiles-sw.js", { scope: "/" })
      .catch((err) => console.warn("[tiles-sw] registration failed", err));
  });
}
