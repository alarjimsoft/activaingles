import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";

import MainLayout from "../layouts/MainLayout";

import MissionSidebar from "../components/mission/MissionSidebar";
import TutorChat from "../components/mission/TutorChat";

import useAppStore from "../store/useAppStore";
import { getMissions } from "../services/missionService";

export default function MissionPage() {
  const { id } = useParams();
  const setMissions = useAppStore((state) => state.setMissions);
  const missions = useAppStore((state) => state.missions);
  useEffect(() => {
    async function loadMissions() {
      try {
        const data = await getMissions("INGLES_A1");

        setMissions(data);
      } catch (error) {
        console.error(error);
      }
    }

    if (missions.length === 0) {
      loadMissions();
    }
  }, []);

  const mission = missions.find((m) => m.missionId === Number(id));
  const [progress, setProgress] = useState(0);

  if (missions.length === 0) {
    return (
      <MainLayout>
        <h1 className="text-white text-4xl">Loading missions...</h1>
      </MainLayout>
    );
  }
  if (!mission) {
    return (
      <MainLayout>
        <h1 className="text-white text-4xl">Mission not found</h1>
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
        <div>
          <MissionSidebar mission={mission} progress={progress} />
        </div>

        <div className="xl:col-span-2">
          <TutorChat mission={mission} setProgress={setProgress} />
        </div>
      </div>
    </MainLayout>
  );
}
