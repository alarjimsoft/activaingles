import MainLayout from "../layouts/MainLayout";

import MissionSidebar from "../components/mission/MissionSidebar";
import TutorChat from "../components/mission/TutorChat";

export default function MissionPage() {
  return (
    <MainLayout>
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-white text-5xl font-bold">Introduce Yourself</h1>

        <p className="text-zinc-400 mt-4 text-lg">
          Learn how to introduce yourself professionally in English.
        </p>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Left Panel */}
        <div>
          <MissionSidebar />
        </div>

        {/* Chat Area */}
        <div className="xl:col-span-2">
          <TutorChat />
        </div>
      </div>
    </MainLayout>
  );
}
