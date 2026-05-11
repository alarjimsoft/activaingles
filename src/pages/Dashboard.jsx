import MainLayout from "../layouts/MainLayout";

import MissionCard from "../components/dashboard/MissionCard";

import StatCard from "../components/ui/StatCard";
import ProgressCard from "../components/ui/ProgressCard";

import useAppStore from "../store/useAppStore";
import { motion } from "framer-motion";

export default function Dashboard() {
  const missions = useAppStore((state) => state.missions);

  const currentUser = useAppStore((state) => state.currentUser);

  return (
    <MainLayout>
      {/* Header */}
      <motion.div
        className="flex items-center justify-between mb-12"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div>
          <h1 className="text-white text-5xl font-bold">Mission Control</h1>

          <p className="text-zinc-400 mt-4 text-lg">
            Welcome back, {currentUser.name}.
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

          <h2 className="text-cyan-400 text-2xl font-bold mt-1">
            {currentUser.level} Beginner
          </h2>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          delay: 0.2,
          duration: 0.5,
        }}
      >
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
      </motion.div>

      {/* Progress */}
      <div className="mb-12">
        <ProgressCard />
      </div>

      {/* Missions */}
      <div>
        <div className="mb-8">
          <h2 className="text-white text-3xl font-bold">Active Missions</h2>

          <p className="text-zinc-400 mt-2">Continue your English journey.</p>
        </div>

        {/* Dynamic Mission Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {missions.map((mission) => (
            <MissionCard
              key={mission.id}
              title={mission.title}
              description={mission.description}
              level={mission.level}
              duration={mission.duration}
              status={mission.status}
            />
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
