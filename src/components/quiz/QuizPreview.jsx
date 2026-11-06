import { useState } from "react";

import { motion } from "framer-motion";
import { Loader2, RotateCcw, X } from "lucide-react";

import QuizPlayer from "./QuizPlayer";
import QuizResults from "./QuizResults";
import { gradeQuizPreview } from "../../services/quizService";
import useNotificationStore from "../../store/useNotificationStore";

// Vista previa a pantalla completa: el académico contesta el quiz como estudiante y ve cómo
// se califica. No guarda nada ni cuenta como intento.
export default function QuizPreview({ version, onClose }) {
  const addNotification = useNotificationStore((s) => s.addNotification);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [grading, setGrading] = useState(false);
  const quiz = version.preview;

  async function handleGrade() {
    setGrading(true);
    try {
      setResult(await gradeQuizPreview(version.versionId, answers));
    } catch (error) {
      addNotification({ type: "error", title: "No se pudo calificar", message: error.message });
    } finally {
      setGrading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col bg-zinc-950"
    >
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3 sm:px-8">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-cyan-400">
            Vista previa · versión {version.versionNumber}
          </p>
          <h2 className="truncate font-semibold text-white">{quiz.title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar vista previa"
          className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
        >
          <X size={20} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-4 sm:p-8">
          <p className="mb-6 rounded-xl bg-zinc-900 px-4 py-3 text-xs text-zinc-400">
            Así verá el quiz el estudiante
            {quiz.timeLimitMinutes ? ` (con ${quiz.timeLimitMinutes} minutos)` : ""}
            {quiz.maxAttempts ? ` · ${quiz.maxAttempts} intentos` : " · intentos ilimitados"}
            {` · se aprueba con ${quiz.passingScore}%`}. Esta vista previa no guarda nada.
          </p>

          {result ? (
            <QuizResults result={result} passingScore={quiz.passingScore} />
          ) : (
            <QuizPlayer
              quiz={quiz}
              answers={answers}
              onAnswer={(key, value) => setAnswers((prev) => ({ ...prev, [key]: value }))}
            />
          )}
        </div>
      </div>

      <footer className="flex justify-end gap-3 border-t border-zinc-800 px-4 py-3 sm:px-8">
        {result ? (
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setAnswers({});
            }}
            className="flex items-center gap-2 rounded-xl bg-zinc-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700"
          >
            <RotateCcw size={16} /> Contestar de nuevo
          </button>
        ) : (
          <button
            type="button"
            onClick={handleGrade}
            disabled={grading}
            className="flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-60"
          >
            {grading && <Loader2 size={16} className="animate-spin" />}
            {grading ? "Calificando…" : "Calificar mi vista previa"}
          </button>
        )}
      </footer>
    </motion.div>
  );
}
