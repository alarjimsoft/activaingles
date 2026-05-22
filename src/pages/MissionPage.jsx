import { useParams, useLocation } from "react-router-dom";
import { useState } from "react";

import MainLayout from "../layouts/MainLayout";

import MissionSidebar from "../components/mission/MissionSidebar";
import TutorChat from "../components/mission/TutorChat";

export default function MissionPage() {
  //useParams();

  const location = useLocation();

  const mission = location.state?.mission;
  const [progress, setProgress] = useState(0);

  console.log("MISSION:", mission);

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
