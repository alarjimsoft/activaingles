import { useParams, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";

import MainLayout from "../layouts/MainLayout";

import MissionSidebar from "../components/mission/MissionSidebar";
import TutorChat from "../components/mission/TutorChat";
import Loader from "../components/ui/Loader";

import useAuthStore from "../store/authStore";
import { getMissions } from "../services/missionService";

export default function MissionPage() {
  const { id } = useParams();
  const location = useLocation();
  const inscripcion = useAuthStore((state) => state.inscripcion);

  const [mission, setMission] = useState(location.state?.mission ?? null);
  const [loading, setLoading] = useState(!location.state?.mission);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (mission) return;
    if (!inscripcion) return;

    async function loadMission() {
      try {
        const missions = await getMissions(
          inscripcion.idCurso,
          inscripcion.idInscripcion,
        );
        const found = missions.find((m) => String(m.id) === String(id));
        if (found) setMission(found);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    loadMission();
  }, [id, inscripcion, mission]);

  if (loading) {
    return (
      <MainLayout>
        <Loader />
      </MainLayout>
    );
  }

  if (!mission) {
    return (
      <MainLayout>
        <div className="text-white p-10">Mission not found</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-white text-5xl font-bold">{mission.title}</h1>

        <p className="text-zinc-400 mt-4 text-lg">{mission.description}</p>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Sidebar */}
        <div>
          <MissionSidebar mission={mission} progress={progress} />
        </div>

        {/* Chat */}
        <div className="xl:col-span-2">
          <TutorChat mission={mission} setProgress={setProgress} />
        </div>
      </div>
    </MainLayout>
  );
}
