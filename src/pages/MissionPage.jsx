import { useParams } from "react-router-dom";

import MainLayout from "../layouts/MainLayout";

import MissionSidebar from "../components/mission/MissionSidebar";
import TutorChat from "../components/mission/TutorChat";

import useAppStore from "../store/useAppStore";

export default function MissionPage() {
  const { id } = useParams();

  const missions = useAppStore((state) => state.missions);

  const mission = missions.find((m) => m.id === Number(id));

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
          <MissionSidebar mission={mission} />
        </div>

        <div className="xl:col-span-2">
          <TutorChat mission={mission} />
        </div>
      </div>
    </MainLayout>
  );
}
