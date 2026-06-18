import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Star, Clock, MessageCircle, Mic, Zap, LayoutDashboard } from "lucide-react";

import useAuthStore from "../../store/authStore";
import { getMissionProgress, completeMission } from "../../services/progressService";

function ScoreCard({ icon: Icon, label, value, color, suffix = "" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-zinc-800 rounded-2xl p-4 flex items-center gap-4"
    >
      <div className={`p-3 rounded-xl ${color.replace("text-", "bg-").replace("400", "500/20")}`}>
        <Icon size={20} className={color} />
      </div>
      <div>
        <p className="text-zinc-400 text-xs">{label}</p>
        <p className={`text-xl font-bold ${color}`}>
          {value !== null && value !== undefined ? `${value}${suffix}` : "—"}
        </p>
      </div>
    </motion.div>
  );
}

export default function CompletionScreen({ mission, practiceScore = null }) {
  const navigate   = useNavigate();
  const inscripcion = useAuthStore((state) => state.inscripcion);

  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!inscripcion || !mission?.id) return;

    async function finalize() {
      try {
        // Mark COMPLETED in Oracle
        await completeMission({
          idInscripcion: inscripcion.idInscripcion,
          missionId: mission.id,
        });
      } catch { /* continuar aunque falle */ }

      try {
        const data = await getMissionProgress(inscripcion.idInscripcion, mission.id);
        setStats(data);
      } catch { /* mostrar pantalla sin stats */ }

      setLoading(false);
    }

    finalize();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="bg-zinc-900 rounded-3xl overflow-hidden"
    >
      {/* Hero */}
      <div className="bg-linear-to-br from-cyan-500/20 to-zinc-900 p-8 text-center border-b border-zinc-800">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
          className="inline-flex items-center justify-center w-20 h-20 bg-cyan-500 rounded-full mb-4"
        >
          <Trophy size={36} className="text-black" />
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-white text-3xl font-bold"
        >
          ¡Misión Completada!
        </motion.h2>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-zinc-400 mt-2"
        >
          {mission.title}
        </motion.p>

        {!loading && stats && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="inline-flex items-center gap-2 mt-4 bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 px-4 py-2 rounded-full"
          >
            <Star size={16} className="fill-cyan-400 text-cyan-400" />
            <span className="font-semibold">{stats.total_xp_earned ?? 0} XP ganados</span>
          </motion.div>
        )}
      </div>

      {/* Stats grid */}
      {!loading && stats && (
        <div className="p-6 grid grid-cols-2 gap-3">
          <ScoreCard
            icon={Zap}
            label="Práctica"
            value={practiceScore ?? stats.practice_score}
            color="text-cyan-400"
            suffix="%"
          />
          <ScoreCard
            icon={MessageCircle}
            label="Gramática"
            value={stats.grammar_score}
            color="text-green-400"
            suffix="/100"
          />
          <ScoreCard
            icon={Mic}
            label="Pronunciación"
            value={stats.pronunciation_score ? Math.round(stats.pronunciation_score) : null}
            color="text-yellow-400"
            suffix="/100"
          />
          <ScoreCard
            icon={Clock}
            label="Tiempo"
            value={stats.total_time_minutes}
            color="text-purple-400"
            suffix=" min"
          />
        </div>
      )}

      {loading && (
        <div className="p-8 text-center text-zinc-500 text-sm">
          Guardando resultados...
        </div>
      )}

      {/* Actions */}
      <div className="p-6 pt-0 space-y-3">
        <button
          onClick={() => navigate("/dashboard")}
          className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2"
        >
          <LayoutDashboard size={18} />
          Ir al Dashboard
        </button>
      </div>
    </motion.div>
  );
}
