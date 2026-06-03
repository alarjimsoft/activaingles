import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  Clock,
  Flame,
  Mic,
  BookOpen,
  Trophy,
  AlertCircle,
} from "lucide-react";

import MainLayout from "../layouts/MainLayout";
import MissionProgressRow from "../components/progress/MissionProgressRow";

import useAuthStore from "../store/authStore";
import { getDashboardStats } from "../services/dashboardService";
import { getMissions } from "../services/missionService";
import { getAllMissionsProgress } from "../services/progressService";

function scoreColor(value) {
  if (value == null) return "text-zinc-500";
  if (value >= 80) return "text-green-400";
  if (value >= 60) return "text-yellow-400";
  return "text-red-400";
}

function scoreBarColor(value) {
  if (value == null) return "bg-zinc-700";
  if (value >= 80) return "bg-green-500";
  if (value >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

function GlobalScoreBar({ label, value, icon: Icon }) {
  const rounded = value != null ? Math.round(value) : null;
  return (
    <div className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-800 rounded-2xl p-5 hover:border-cyan-500/30 transition">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} className="text-zinc-400" />
        <span className="text-zinc-300 text-xs uppercase tracking-widest font-semibold">
          {label}
        </span>
      </div>
      <p className={`text-3xl font-black mb-3 ${scoreColor(value)}`}>
        {rounded != null ? `${rounded}%` : "—"}
      </p>
      <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${scoreBarColor(value)}`}
          style={{ width: `${rounded != null ? Math.min(rounded, 100) : 0}%` }}
        />
      </div>
    </div>
  );
}

function StatItem({ icon: Icon, label, value }) {
  return (
    <div className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-800 rounded-2xl p-5 hover:border-cyan-500/30 transition">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} className="text-zinc-400" />
        <span className="text-zinc-300 text-xs uppercase tracking-widest font-semibold">
          {label}
        </span>
      </div>
      <p className="text-3xl font-black text-cyan-400">{value}</p>
    </div>
  );
}

export default function Progress() {
  const student = useAuthStore((state) => state.student);
  const inscripcion = useAuthStore((state) => state.inscripcion);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [missions, setMissions] = useState([]);
  const [missionProgressMap, setMissionProgressMap] = useState({});

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Fase 1: stats globales + lista de misiones en paralelo
        const [statsData, missionsData] = await Promise.all([
          getDashboardStats(inscripcion.idInscripcion),
          getMissions(inscripcion.idCurso, inscripcion.idInscripcion),
        ]);
        setStats(statsData);
        setMissions(missionsData);

        // Fase 2: progreso por misión (N llamadas paralelas, solo no-LOCKED)
        const progressMap = await getAllMissionsProgress(
          inscripcion.idInscripcion,
          missionsData,
        );
        setMissionProgressMap(progressMap);
      } catch (err) {
        setError(err.message || "Could not load progress data.");
      } finally {
        setLoading(false);
      }
    }

    if (inscripcion) load();
  }, [inscripcion]);

  // Agrupa misiones por topic (mismo patrón que Dashboard)
  const groupedMissions = missions.reduce((acc, mission) => {
    const topicTitle = mission.topicTitle;
    if (!acc[topicTitle]) acc[topicTitle] = [];
    acc[topicTitle].push(mission);
    return acc;
  }, {});

  if (!student || !inscripcion) {
    return (
      <MainLayout>
        <div className="text-zinc-400 p-10">No authenticated student.</div>
      </MainLayout>
    );
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm">Loading your analytics…</p>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <AlertCircle size={36} className="text-red-400" />
          <p className="text-red-400 font-semibold">Failed to load progress</p>
          <p className="text-zinc-500 text-sm">{error}</p>
        </div>
      </MainLayout>
    );
  }

  const xpPercent = stats?.xp_next_level
    ? Math.min(
        Math.round(((stats.total_xp || 0) / stats.xp_next_level) * 100),
        100,
      )
    : 0;

  return (
    <MainLayout>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <motion.div
        className="flex items-center justify-between mb-12"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div>
          <h1 className="text-white text-5xl font-bold">Learning Analytics</h1>
          <p className="text-zinc-400 mt-4 text-lg">
            Tracking your English journey, {student.nombre}.
          </p>
        </div>

        {/* Level + XP badge */}
        <div className="bg-zinc-900 border border-zinc-800 px-5 py-4 rounded-2xl min-w-55">
          <p className="text-zinc-400 text-sm">Current Level</p>
          <h2 className="text-cyan-300 text-3xl font-extrabold mt-1">
            Level {stats?.level || 1}
          </h2>
          <p className="text-zinc-500 text-sm mt-2">
            {stats?.total_xp || 0} XP
          </p>
          <div className="w-full h-2 bg-zinc-800 rounded-full mt-3">
            <div
              className="h-full bg-cyan-500 rounded-full transition-all duration-1000"
              style={{ width: `${xpPercent}%` }}
            />
          </div>
          <p className="text-zinc-500 text-xs mt-1">
            {stats?.total_xp || 0} / {stats?.xp_next_level || 200} XP to Level{" "}
            {(stats?.level || 1) + 1}
          </p>
        </div>
      </motion.div>

      {/* ── KPIs globales ──────────────────────────────────────────── */}
      <motion.div
        className="grid grid-cols-2 xl:grid-cols-4 gap-6 mb-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.5 }}
      >
        <StatItem
          icon={Clock}
          label="Study Time"
          value={`${stats?.total_time || 0} min`}
        />
        <StatItem
          icon={Flame}
          label="Current Streak"
          value={`${student.streakDays ?? 0} days`}
        />
        <GlobalScoreBar
          icon={BookOpen}
          label="Grammar Avg"
          value={stats?.avg_grammar ?? null}
        />
        <GlobalScoreBar
          icon={Mic}
          label="Pronunciation Avg"
          value={stats?.avg_pronunciation ?? null}
        />
      </motion.div>

      {/* ── Resumen de misiones ─────────────────────────────────────── */}
      <motion.div
        className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-800 rounded-3xl p-6 mb-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25, duration: 0.5 }}
      >
        <div className="flex items-center gap-3 mb-4">
          <Trophy size={18} className="text-cyan-400" />
          <h2 className="text-white text-lg font-bold">Mission Overview</h2>
        </div>

        <div className="flex items-center gap-6">
          <div>
            <p className="text-zinc-400 text-sm">Completed</p>
            <p className="text-green-400 text-3xl font-black">
              {stats?.completed_missions || 0}
            </p>
          </div>
          <div>
            <p className="text-zinc-400 text-sm">Total</p>
            <p className="text-white text-3xl font-black">
              {stats?.total_missions || 0}
            </p>
          </div>
          <div className="flex-1">
            <div className="flex justify-between mb-1.5">
              <span className="text-zinc-400 text-sm">Overall Progress</span>
              <span className="text-cyan-400 text-sm font-bold">
                {stats?.avg_progress || 0}%
              </span>
            </div>
            <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 rounded-full transition-all duration-1000"
                style={{ width: `${stats?.avg_progress || 0}%` }}
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Progreso por topic ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.5 }}
      >
        <div className="flex items-center gap-3 mb-8">
          <BarChart3 size={22} className="text-cyan-400" />
          <h2 className="text-white text-3xl font-bold">Progress by Mission</h2>
        </div>

        {Object.keys(groupedMissions).length === 0 ? (
          <div className="text-center py-16">
            <p className="text-zinc-400 text-lg">No missions found.</p>
            <p className="text-zinc-600 text-sm mt-2">
              Start practicing to see your progress here.
            </p>
          </div>
        ) : (
          <div className="space-y-16">
            {Object.entries(groupedMissions).map(
              ([topicTitle, topicMissions]) => (
                <div key={topicTitle}>
                  {/* Topic header */}
                  <div className="mb-6">
                    <h3 className="text-cyan-400 text-2xl font-extrabold tracking-wide">
                      {topicTitle}
                    </h3>
                    <p className="text-zinc-500 text-sm mt-1">
                      {topicMissions.filter((m) => m.status === "COMPLETED").length} /{" "}
                      {topicMissions.length} completed
                    </p>
                    <div className="w-full h-px bg-zinc-800 mt-4" />
                  </div>

                  {/* Mission rows */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {topicMissions.map((mission, idx) => (
                      <MissionProgressRow
                        key={mission.missionId}
                        mission={mission}
                        progress={missionProgressMap[mission.missionId] ?? null}
                        index={idx}
                      />
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </motion.div>
    </MainLayout>
  );
}
