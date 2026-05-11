import MainLayout from "../layouts/MainLayout";

import MissionCard from "../components/dashboard/MissionCard";

import StatCard from "../components/ui/StatCard";
import ProgressCard from "../components/ui/ProgressCard";

export default function Dashboard() {
  return (
    <MainLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-12">
        <div>
          <h1 className="text-white text-5xl font-bold">Mission Control</h1>

          <p className="text-zinc-400 mt-4 text-lg">
            Welcome back, Luis Angel.
          </p>
        </div>

        {/* User Badge */}
        <div
          className="
            bg-zinc-900
            border border-zinc-800
            px-5 py-4
            rounded-2xl
          "
        >
          <p className="text-zinc-400 text-sm">Current Level</p>

          <h2 className="text-cyan-400 text-2xl font-bold mt-1">A1 Beginner</h2>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <StatCard
          title="Completed Missions"
          value="05"
          subtitle="+2 this week"
        />

        <StatCard
          title="Study Time"
          value="12h"
          subtitle="Excellent consistency"
        />

        <StatCard title="Current Streak" value="7 Days" subtitle="Keep going" />
      </div>

      {/* Progress + Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-12">
        {/* Progress */}
        <div className="xl:col-span-2">
          <ProgressCard />
        </div>

        {/* Activity */}
        <div
          className="
            bg-zinc-900/70
            backdrop-blur-xl
            border border-zinc-800
            rounded-3xl
            p-8
          "
        >
          <h2 className="text-white text-2xl font-bold mb-6">
            Recent Activity
          </h2>

          <div className="space-y-5">
            <div className="border-l-2 border-cyan-500 pl-4">
              <p className="text-white">Completed “Introduce Yourself”</p>

              <p className="text-zinc-500 text-sm mt-1">2 hours ago</p>
            </div>

            <div className="border-l-2 border-emerald-500 pl-4">
              <p className="text-white">Achieved 90% in Grammar Quiz</p>

              <p className="text-zinc-500 text-sm mt-1">Yesterday</p>
            </div>

            <div className="border-l-2 border-violet-500 pl-4">
              <p className="text-white">New vocabulary unlocked</p>

              <p className="text-zinc-500 text-sm mt-1">2 days ago</p>
            </div>
          </div>
        </div>
      </div>

      {/* Mission Section */}
      <div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-white text-3xl font-bold">Active Missions</h2>

            <p className="text-zinc-400 mt-2">Continue your English journey.</p>
          </div>
        </div>

        {/* Mission Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          <MissionCard
            title="Introduce Yourself"
            description="Learn how to say your name, profession and nationality in English."
            level="A1"
            duration="10 min"
            status="active"
          />

          <MissionCard
            title="At The Coffee Shop"
            description="Practice ordering drinks and asking for prices."
            level="A1"
            duration="15 min"
            status="locked"
          />

          <MissionCard
            title="Daily Routine"
            description="Describe your daily activities using present simple."
            level="A1"
            duration="20 min"
            status="completed"
          />
        </div>
      </div>
    </MainLayout>
  );
}
