/**
 * Full-Atlas experience for any planet in the catalog.  Routes
 * `/planet/:id` (except the Sun) here so users get the same command-
 * center HUD, tile brush, model placement, and Play mode over the
 * planet's own ellipsoid and NASA-derived albedo texture.  The Sun and
 * unknown IDs fall back to the lightweight sphere viewer.
 */
import { useParams, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { findPlanet, type PlanetId } from "@/lib/planets/config";

const SpaceshipPage = lazy(() => import("@/pages/SpaceshipPage"));
const PlanetPage = lazy(() => import("@/pages/PlanetPage"));

export default function PlanetAtlasPage() {
  const { id = "" } = useParams();
  const planet = findPlanet(id);
  if (!planet) return <Navigate to="/atlas" replace />;
  // Route earth/moon/mars to their canonical URLs so a single history
  // entry backs each world.
  if (planet.id === "earth") return <Navigate to="/atlas" replace />;
  if (planet.id === "moon") return <Navigate to="/moon" replace />;
  if (planet.id === "mars") return <Navigate to="/mars" replace />;
  // The Sun has no solid surface / ellipsoid to walk on — keep the
  // dedicated sphere + corona viewer for it.
  if (planet.id === "sun") return <PlanetPage />;
  const Cmp = SpaceshipPage as unknown as (p: {
    planetId: PlanetId;
  }) => JSX.Element;
  return (
    <Suspense fallback={<div className="w-full h-screen bg-[#0a0a1a]" />}>
      {/* Key on planet id so switching between /planet/<id> routes
          remounts the Atlas viewer — otherwise Cesium keeps the previous
          planet's ellipsoid, imagery, and camera framing, which breaks
          centering and zoom on the newly selected world. */}
      <Cmp key={planet.id} planetId={planet.id} />
    </Suspense>
  );
}