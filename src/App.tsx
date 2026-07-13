import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/AppLayout";
import ErrorBoundary from "@/components/ErrorBoundary";
import LandingPage from "@/pages/LandingPage";
import DashboardPage from "@/pages/DashboardPage";
import MarketplacePage from "@/pages/MarketplacePage";
import CRMPage from "@/pages/CRMPage";
import ERPPage from "@/pages/ERPPage";
import LogisticsPage from "@/pages/LogisticsPage";
import PaymentsPage from "@/pages/PaymentsPage";
import ProjectsPage from "@/pages/ProjectsPage";
import SettingsPage from "@/pages/SettingsPage";
import DeliveryPage from "@/pages/DeliveryPage";
// Lazy-load the Atlas/Spaceship page — it pulls in Cesium (~4MB), Three.js,
// and R3F, which we don't want blocking the initial paint of lighter routes
// like /landing, /files, or the admin dashboard. (P15)
const SpaceshipPage = lazy(() => import("@/pages/SpaceshipPage"));
const MoonPage = lazy(() =>
  import("@/pages/SpaceshipPage").then((m) => ({
    default: () => {
      const Cmp = m.default as unknown as (p: { moonMode?: boolean }) => JSX.Element;
      return <Cmp moonMode />;
    },
  })),
);
const MarsPage = lazy(() =>
  import("@/pages/SpaceshipPage").then((m) => ({
    default: () => {
      const Cmp = m.default as unknown as (p: { marsMode?: boolean }) => JSX.Element;
      return <Cmp marsMode />;
    },
  })),
);
const PlanetAtlasPage = lazy(() => import("@/pages/PlanetAtlasPage"));
import IconsPage from "@/pages/IconsPage";
import LevelsListPage from "@/pages/LevelsListPage";
import LevelEditorPage from "@/pages/LevelEditorPage";
import FilesPage from "@/pages/FilesPage";
import ImagineDesignLabPage from "@/pages/ImagineDesignLabPage";
import NotFound from "./pages/NotFound.tsx";
const GeoRealmPage = lazy(() => import("@/pages/GeoRealmPage"));
const PublicTileCardPage = lazy(() => import("@/pages/PublicTileCardPage"));
const AlertsSettingsPage = lazy(() => import("@/pages/AlertsSettingsPage"));
const AlertReportPage = lazy(() => import("@/pages/AlertReportPage"));
const UnsubscribePage = lazy(() => import("@/pages/UnsubscribePage"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ErrorBoundary>
        <Suspense fallback={<div className="w-full h-screen bg-[#0a0a1a]" />}>
        <Routes>
          {/* Public Website */}
          <Route path="/" element={<SpaceshipPage />} />
          <Route path="/atlas" element={<SpaceshipPage />} />
          <Route path="/explore" element={<SpaceshipPage />} />
          <Route path="/moon" element={<MoonPage />} />
          <Route path="/mars" element={<MarsPage />} />
          <Route path="/planet/:id" element={<PlanetAtlasPage />} />
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/icons" element={<IconsPage />} />

          {/* LEVEL editor — independent creative scenes */}
          <Route path="/levels" element={<LevelsListPage />} />
          <Route path="/level/:id" element={<LevelEditorPage />} />
          <Route path="/locomotion" element={<LevelEditorPage />} />

          {/* Files — sharing, friends, matchmaking */}
          <Route path="/files" element={<FilesPage />} />

          {/* Imagine Engine design sandbox */}
          <Route path="/imagine-lab" element={<ImagineDesignLabPage />} />

          {/* Geo Realm — subsurface compiler & viewer */}
          <Route path="/geo-realm" element={<GeoRealmPage />} />

          {/* Publicly shared tile card */}
          <Route path="/tile/:id" element={<PublicTileCardPage />} />

          {/* Disaster alerts */}
          <Route path="/settings/alerts" element={<AlertsSettingsPage />} />
          <Route path="/alerts/:id/report" element={<AlertReportPage />} />
          <Route path="/alerts/:id" element={<AlertReportPage />} />
          <Route path="/unsubscribe" element={<UnsubscribePage />} />

          {/* Admin Dashboard */}
          <Route path="/dashboard" element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="marketplace" element={<MarketplacePage />} />
            <Route path="crm" element={<CRMPage />} />
            <Route path="erp" element={<ERPPage />} />
            <Route path="logistics" element={<LogisticsPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="deliveries" element={<DeliveryPage />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
