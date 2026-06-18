import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import SpaceshipPage from "@/pages/SpaceshipPage";
import IconsPage from "@/pages/IconsPage";
import LevelsListPage from "@/pages/LevelsListPage";
import LevelEditorPage from "@/pages/LevelEditorPage";
import LocomotionPage from "@/pages/LocomotionPage";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ErrorBoundary>
        <Routes>
          {/* Public Website */}
          <Route path="/" element={<SpaceshipPage />} />
          <Route path="/atlas" element={<SpaceshipPage />} />
          <Route path="/explore" element={<SpaceshipPage />} />
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/icons" element={<IconsPage />} />

          {/* LEVEL editor — independent creative scenes */}
          <Route path="/levels" element={<LevelsListPage />} />
          <Route path="/level/:id" element={<LevelEditorPage />} />
          <Route path="/locomotion" element={<LocomotionPage />} />

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
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
