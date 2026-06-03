import { Lock, CheckCircle, Play } from "lucide-react";
import { motion } from "framer-motion";

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

function StatusBadge({ status }) {
  if (status === "COMPLETED")
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-green-400 bg-green-400/10 px-2.5 py-1 rounded-full border border-green-400/20 whitespace-nowrap">
        <CheckCircle size={11} />
        Completed
      </span>
    );
  if (status === "ACTIVE")
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-cyan-400 bg-cyan-400/10 px-2.5 py-1 rounded-full border border-cyan-400/20 whitespace-nowrap">
        <Play size={11} />
        Active
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs font-semibold text-zinc-500 bg-zinc-800 px-2.5 py-1 rounded-full border border-zinc-700 whitespace-nowrap">
      <Lock size={11} />
      Locked
    </span>
  );
}

function ScoreBar({ label, value }) {
  const rounded = value != null ? Math.round(value) : null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between">
        <span className="text-zinc-400 text-xs">{label}</span>
        <span className={`text-xs font-bold ${scoreColor(value)}`}>
          {rounded != null ? `${rounded}%` : "—"}
        </span>
      </div>
      <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${scoreBarColor(value)}`}
          style={{ width: `${rounded != null ? Math.min(rounded, 100) : 0}%` }}
        />
      </div>
    </div>
  );
}

export default function MissionProgressRow({ mission, progress, index = 0 }) {
  const isLocked = mission.status === "LOCKED";

  const progressPercent = progress?.progress_percent ?? 0;
  const grammarScore =
    progress?.grammar_score != null ? progress.grammar_score : null;
  const pronunciationScore =
    progress?.pronunciation_score != null &&
    progress.pronunciation_score > 0
      ? progress.pronunciation_score
      : null;
  const xpEarned = progress?.total_xp_earned ?? 0;
  const timeMinutes = progress?.total_time_minutes ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={`
        bg-zinc-900/70 backdrop-blur-xl border rounded-2xl p-5
        transition hover:shadow-lg
        ${isLocked
          ? "border-zinc-800/50 opacity-50"
          : "border-zinc-800 hover:border-cyan-500/30 hover:shadow-cyan-500/5"
        }
      `}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm leading-snug truncate">
            {mission.title}
          </p>
          <p className="text-zinc-500 text-xs mt-0.5">
            {mission.level}
            {mission.grammarTitle ? ` · ${mission.grammarTitle}` : ""}
          </p>
        </div>
        <StatusBadge status={mission.status} />
      </div>

      {isLocked ? (
        <p className="text-zinc-600 text-xs italic">
          Complete previous missions to unlock
        </p>
      ) : (
        <>
          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex justify-between mb-1">
              <span className="text-zinc-400 text-xs">Progress</span>
              <span className="text-cyan-400 text-xs font-bold">
                {progressPercent}%
              </span>
            </div>
            <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(progressPercent, 100)}%` }}
              />
            </div>
          </div>

          {/* Score bars */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
            <ScoreBar label="Grammar" value={grammarScore} />
            <ScoreBar label="Pronunciation" value={pronunciationScore} />
          </div>

          {/* Stats row */}
          <div className="flex gap-4 pt-3 border-t border-zinc-800">
            <div>
              <p className="text-zinc-500 text-xs">XP Earned</p>
              <p className="text-cyan-300 text-sm font-bold">{xpEarned} xp</p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs">Study Time</p>
              <p className="text-zinc-200 text-sm font-bold">{timeMinutes} min</p>
            </div>
            {pronunciationScore == null && (
              <div className="ml-auto flex items-end">
                <p className="text-zinc-600 text-xs italic">
                  Use voice to get pronunciation score
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}
