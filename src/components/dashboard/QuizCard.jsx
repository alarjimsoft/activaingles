import { motion } from "framer-motion";
import { CheckCircle2, ClipboardCheck, Clock3, Lock, PlayCircle, RotateCcw, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Quiz que se presenta después de un tema (datos de GET /api/quizzes/available/:idInscripcion)
export default function QuizCard({ quiz }) {
  const navigate = useNavigate();

  const locked = quiz.status === "LOCKED";
  const passed = quiz.passed === "Y";
  const inProgress = Boolean(quiz.inProgressAttemptId);
  const noAttemptsLeft = quiz.attemptsLeft === 0 && !inProgress;

  let action = "Presentar quiz";
  let ActionIcon = PlayCircle;
  if (locked) [action, ActionIcon] = ["Bloqueado", Lock];
  else if (inProgress) [action, ActionIcon] = ["Continuar intento", PlayCircle];
  else if (noAttemptsLeft) [action, ActionIcon] = ["Ver detalles", ClipboardCheck];
  else if (quiz.attemptsUsed > 0) [action, ActionIcon] = [passed ? "Mejorar calificación" : "Intentar de nuevo", RotateCcw];

  const tone = locked
    ? "border-zinc-800"
    : passed
      ? "border-emerald-500/40 shadow-emerald-500/10"
      : "border-violet-500/40 shadow-violet-500/10";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`mt-8 rounded-3xl border bg-linear-to-br from-violet-500/10 via-zinc-900 to-zinc-900 p-5 shadow-xl sm:p-6 ${tone}`}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-violet-500/15 p-3">
            {locked ? (
              <Lock size={28} className="text-zinc-500" />
            ) : passed ? (
              <CheckCircle2 size={28} className="text-emerald-400" />
            ) : (
              <ClipboardCheck size={28} className="text-violet-300" />
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">Quiz del tema</p>
            <h3 className="mt-1 text-xl font-bold text-white sm:text-2xl">{quiz.title}</h3>
            <p className="mt-1 text-sm text-zinc-400">
              {locked
                ? `Termina las misiones hasta «${quiz.afterTopicTitle}» para desbloquearlo.`
                : `${quiz.questionCount} preguntas · se aprueba con ${quiz.passingScore}%`}
            </p>

            {!locked && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                {quiz.timeLimitMinutes && (
                  <span className="flex items-center gap-1">
                    <Clock3 size={13} /> {quiz.timeLimitMinutes} min
                  </span>
                )}
                <span>
                  {quiz.maxAttempts
                    ? `Intentos: ${quiz.attemptsUsed} de ${quiz.maxAttempts}`
                    : `Intentos: ${quiz.attemptsUsed} (sin límite)`}
                </span>
                {quiz.bestScorePercent != null && (
                  <span className={passed ? "text-emerald-300" : "text-amber-300"}>
                    Mejor: {Math.round(quiz.bestScorePercent)}%
                  </span>
                )}
                {quiz.bestXp > 0 && (
                  <span className="flex items-center gap-1 text-cyan-300">
                    <Sparkles size={13} /> {quiz.bestXp} XP
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          disabled={locked}
          onClick={() => navigate(`/quizzes/${quiz.quizId}`)}
          className={`flex shrink-0 items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold transition-colors ${
            locked
              ? "cursor-not-allowed bg-zinc-800 text-zinc-500"
              : passed && !inProgress
                ? "bg-emerald-500 text-black hover:bg-emerald-400"
                : "bg-violet-500 text-white hover:bg-violet-400"
          }`}
        >
          <ActionIcon size={18} />
          {action}
        </button>
      </div>
    </motion.div>
  );
}
