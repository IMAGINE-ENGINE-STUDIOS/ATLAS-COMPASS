/**
 * Imagine Engine Studio — standalone entry to the full 3D level creation suite
 * (menus, tools, inspectors, play mode, Rig Controller Room). Reuses the level
 * editor so both pages always share the same features.
 */
import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import LevelEditorPage from "@/pages/LevelEditorPage";
import { createLocalLevel, listLocalLevels } from "@/lib/localLevels";

export default function ImagineEngineStudioPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const isRigRoom = location.pathname.endsWith("/rig-room");

  useEffect(() => {
    if (id || isRigRoom) return;
    const levels = listLocalLevels();
    const latest = [...levels].sort((a: any, b: any) =>
      String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")),
    )[0];
    const target = latest ?? createLocalLevel();
    navigate(`/imagine-studio/${target.id}`, { replace: true });
  }, [id, isRigRoom, navigate]);

  if (!id && !isRigRoom) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  return <LevelEditorPage key={isRigRoom ? "rig" : id} />;
}
