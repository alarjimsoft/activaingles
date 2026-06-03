import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Flame,
  Clock,
  Trophy,
  TrendingUp,
  BookOpen,
  Mic,
  AlertCircle,
  GraduationCap,
  IdCard,
} from "lucide-react";

import MainLayout from "../layouts/MainLayout";
import useAuthStore from "../store/authStore";
import { getDashboardStats } from "../services/dashboardService";

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

function StatCard({ icon: Icon, label, value }) {
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

function PerformanceBar({ icon: Icon, label, value }) {
  const rounded = value != null ? Math.round(value) : null;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-zinc-400" />
          <span className="text-zinc-300 text-sm font-medium">{label}</span>
        </div>
        <span className={`text-sm font-bold ${scoreColor(value)}`}>
          {rounded != null ? `${rounded}%` : "—"}
        </span>
      </div>
      <div className="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${scoreBarColor(value)}`}
          style={{ width: `${rounded != null ? Math.min(rounded, 100) : 0}%` }}
        />
      </div>
    </div>
  );
}

export default function Profile() {
  const student = useAuthStore((state) => state.student);
  const inscripcion = useAuthStore((state) => state.inscripcion);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getDashboardStats(inscripcion.idInscripcion);
        setStats(data);
      } catch (err) {
        setError(err.message || "Could not load profile data.");
      } finally {
        setLoading(false);
      }
    }
    if (inscripcion) load();
  }, [inscripcion]);

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
          <p className="text-zinc-400 text-sm">Loading profile…</p>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <AlertCircle size={36} className="text-red-400" />
          <p className="text-red-400 font-semibold">Failed to load profile</p>
          <p className="text-zinc-500 text-sm">{error}</p>
        </div>
      </MainLayout>
    );
  }

  // Nombre completo construido desde tres campos separados (ver PKG_AUTH.LOGIN_ESTUDIANTE)
  const fullName = [student.nombre, student.apellidoPaterno, student.apellidoMaterno]
    .filter(Boolean)
    .join(" ");

  // Iniciales para el avatar placeholder
  const initials = `${student.nombre?.[0] || ""}${student.apellidoPaterno?.[0] || ""}`.toUpperCase();

  // XP hacia el siguiente nivel — usar stats.total_xp (USER_PROGRESS), no student.xp (ESTUDIANTES)
  const xpPercent = stats?.xp_next_level
    ? Math.min(Math.round(((stats.total_xp || 0) / stats.xp_next_level) * 100), 100)
    : 0;

  return (
    <MainLayout>
      {/* ── Header: identidad del estudiante ─────────────────────── */}
      <motion.div
        className="mb-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-white text-5xl font-bold mb-10">Student Profile</h1>

        <div className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-800 rounded-3xl p-8">
          <div className="flex items-center gap-7">
            {/* Avatar con iniciales */}
            <div
              className="
                w-24 h-24 rounded-full shrink-0
                flex items-center justify-center
                text-3xl font-black text-white
                bg-linear-to-br from-cyan-500 to-cyan-700
                border-4 border-cyan-500/30
              "
            >
              {initials || <GraduationCap size={36} />}
            </div>

            {/* Datos de identidad */}
            <div className="min-w-0 grow">
              <h2 className="text-white text-3xl font-bold leading-tight truncate">
                {fullName}
              </h2>

              <div className="flex flex-wrap items-center gap-3 mt-3">
                {/* Matrícula */}
                <div className="flex items-center gap-1.5 text-zinc-400 text-sm">
                  <IdCard size={14} />
                  <span>{student.matricula}</span>
                </div>

                {/* Nivel CEFR */}
                <span className="flex items-center gap-1.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-sm font-bold px-3 py-1 rounded-full">
                  <GraduationCap size={13} />
                  {student.nivel || "A1"}
                </span>
              </div>
            </div>

            {/* Level badge */}
            <div className="shrink-0 text-right">
              <p className="text-zinc-400 text-sm">Gamification Level</p>
              <p className="text-cyan-300 text-4xl font-extrabold mt-1">
                Level {stats?.level || 1}
              </p>
              <p className="text-zinc-500 text-sm mt-1">
                {stats?.total_xp || 0} XP
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── XP progress hacia siguiente nivel ────────────────────── */}
      <motion.div
        className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-800 rounded-3xl p-6 mb-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.5 }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-zinc-300 text-sm font-semibold uppercase tracking-widest">
              XP Progress
            </p>
            <p className="text-zinc-500 text-xs mt-0.5">
              {stats?.total_xp || 0} / {stats?.xp_next_level || 200} XP → Level{" "}
              {(stats?.level || 1) + 1}
            </p>
          </div>
          <span className="text-cyan-400 text-2xl font-black">{xpPercent}%</span>
        </div>
        <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-cyan-500 rounded-full transition-all duration-1000"
            style={{ width: `${xpPercent}%` }}
          />
        </div>
      </motion.div>

      {/* ── Stats grid ────────────────────────────────────────────── */}
      <motion.div
        className="grid grid-cols-2 xl:grid-cols-4 gap-6 mb-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25, duration: 0.5 }}
      >
        <StatCard
          icon={Flame}
          label="Current Streak"
          value={`${student.streakDays ?? 0} days`}
        />
        <StatCard
          icon={Clock}
          label="Study Time"
          value={`${stats?.total_time || 0} min`}
        />
        <StatCard
          icon={Trophy}
          label="Missions"
          value={`${stats?.completed_missions || 0} / ${stats?.total_missions || 0}`}
        />
        <StatCard
          icon={TrendingUp}
          label="Avg Progress"
          value={`${stats?.avg_progress || 0}%`}
        />
      </motion.div>

      {/* ── Performance scores ────────────────────────────────────── */}
      <motion.div
        className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-800 rounded-3xl p-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.5 }}
      >
        <p className="text-zinc-300 text-xs uppercase tracking-widest font-semibold mb-6">
          Performance Averages
        </p>

        <div className="flex flex-col gap-6">
          <PerformanceBar
            icon={BookOpen}
            label="Grammar"
            value={stats?.avg_grammar ?? null}
          />
          <PerformanceBar
            icon={Mic}
            label="Pronunciation"
            value={stats?.avg_pronunciation ?? null}
          />
        </div>

        <p className="text-zinc-600 text-xs mt-6 italic">
          Averages calculated from all mission sessions. Pronunciation reflects voice sessions only.
        </p>
      </motion.div>
    </MainLayout>
  );
}
