import MainLayout from "../layouts/MainLayout";

import MissionCard from "../components/dashboard/MissionCard";

import StatCard from "../components/ui/StatCard";
import ProgressCard from "../components/ui/ProgressCard";

import { motion } from "framer-motion";

import { useEffect, useState } from "react";

import useAuthStore from "../store/authStore";

import { getMissions } from "../services/missionService";
import { getDashboardStats } from "../services/dashboardService";

export default function Dashboard() {
  const student = useAuthStore((state) => state.student);

  const inscripcion = useAuthStore((state) => state.inscripcion);

  const [missions, setMissions] = useState([]);
  const [stats, setStats] = useState(null);
  const groupedMissions = missions.reduce((acc, mission) => {
    //const topicTitle = mission.topicTitle || "General";
    const topicTitle = mission.topicTitle;

    if (!acc[topicTitle]) {
      acc[topicTitle] = [];
    }

    acc[topicTitle].push(mission);

    return acc;
  }, {});

  useEffect(() => {
    async function loadStats() {
      try {
        const data = await getDashboardStats(inscripcion.idInscripcion);

        setStats(data);
      } catch (error) {
        console.error(error);
      }
    }

    if (inscripcion) {
      loadStats();
    }
  }, [inscripcion]);

  useEffect(() => {
    async function loadMissions() {
      try {
        if (!inscripcion) return;

        const data = await getMissions(
          inscripcion.idCurso,
          inscripcion.idInscripcion,
        );

        setMissions(data);
      } catch (error) {
        console.error(error);
      }
    }

    loadMissions();
  }, [inscripcion]);

  // ✅ VALIDACIONES DESPUÉS
  // DE TODOS LOS HOOKS

  if (!student) {
    return <div className="text-white p-10">No authenticated student</div>;
  }

  if (!inscripcion) {
    return <div className="text-white p-10">No enrollment</div>;
  }

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
            Welcome back, {student.nombre}.
          </p>
        </div>

        {/* User Badge */}
        <div
          className="
    bg-zinc-900
    border border-zinc-800
    px-5 py-4
    rounded-2xl
    min-w-[220px]
  "
        >
          <p className="text-zinc-400 text-sm">Current Level</p>

          <h2 className="text-cyan-300 text-3xl font-extrabold mt-1">
            Level {stats?.level || 1}
          </h2>

          <p className="text-zinc-500 text-sm mt-2">
            {stats?.total_xp || 0} XP
          </p>

          {/* XP Progress */}
          <div className="w-full h-2 bg-zinc-800 rounded-full mt-4">
            <div
              className="h-full bg-cyan-500 rounded-full"
              style={{
                width: `${Math.min(
                  ((stats?.total_xp || 0) / (stats?.xp_next_level || 100)) *
                    100,
                  100,
                )}%`,
              }}
            ></div>
          </div>

          <p className="text-zinc-500 text-xs mt-2">
            {stats?.total_xp || 0}
            {" / "}
            {stats?.xp_next_level || 100} XP
          </p>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6 mb-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          delay: 0.2,
          duration: 0.5,
        }}
      >
        <StatCard
          title="Completed Missions"
          value={stats?.completed_missions || 0}
          subtitle="+2 this week"
        />

        <StatCard
          title="Study Time"
          value={`${stats?.total_time || 0} min`}
          subtitle="Excellent consistency"
        />

        <StatCard
          title="Current Streak"
          value={`${student.streakDays ?? 0} Days`}
          subtitle="Keep going"
        />

        <StatCard
          title="Pronunciation"
          value={`${stats?.avg_pronunciation || 0}%`}
          subtitle="Speaking performance"
        />

        <StatCard
          title="Grammar"
          value={`${stats?.avg_grammar || 0}%`}
          subtitle="Grammar accuracy"
        />
      </motion.div>

      {/* Progress */}
      <div className="mb-12">
        <ProgressCard
          progress={stats?.avg_progress || 0}
          completed={stats?.completed_missions || 0}
          total={stats?.total_missions || 0}
        />
      </div>

      {/* Missions */}
      <div>
        <div className="mb-8">
          <h2 className="text-white text-3xl font-bold">Active Missions</h2>

          <p className="text-zinc-400 mt-2">Continue your English journey.</p>
        </div>

        {/* Dynamic Mission Grid */}
        <div className="space-y-16">
          {Object.entries(groupedMissions).map(
            ([topicTitle, topicMissions]) => (
              <div key={topicTitle}>
                {/* Topic Header */}
                <div className="mb-10">
                  <h2
                    className="text-cyan-400 text-4xl font-extrabold mb-4 tracking-wide"
                    style={{
                      color: "#22d3ee",
                      opacity: 1,
                    }}
                  >
                    {topicTitle}
                  </h2>
                  <p className="text-zinc-500 text-sm mb-6">Topic Missions</p>
                  <div className="w-full h-px bg-zinc-800 mt-4"></div>
                </div>

                {/* Missions Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                  {topicMissions.map((mission) => (
                    <MissionCard key={mission.missionId} mission={mission} />
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    </MainLayout>
  );
}
