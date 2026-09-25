import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Loader2, AlertCircle, Trophy } from "lucide-react";

import useAuthStore from "../../store/authStore";
import { generateActivities, evaluateAnswer, saveActivityResult } from "../../services/activityService";
import ActivityCard from "./ActivityCard";
import ActivityFeedback from "./ActivityFeedback";

export default function PracticeZone({
  missionContent,
  missionId,
  levelCode = "A1",
  onComplete,
  isCompleted = false,
  previousScore = null,
}) {
  const inscripcion = useAuthStore((state) => state.inscripcion);

  // 'loading' | 'activity' | 'evaluating' | 'feedback' | 'summary' | 'error'
  const [phase, setPhase]             = useState(isCompleted ? "summary" : "loading");
  const [activities, setActivities]   = useState([]);
  const [currentIdx, setCurrentIdx]   = useState(0);
  const [currentResult, setCurrentResult] = useState(null);
  const [results, setResults]         = useState([]);

  useEffect(() => {
    if (isCompleted) return;
    loadActivities();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadActivities() {
    try {
      const acts = await generateActivities(missionContent, missionId, levelCode);
      setActivities(acts);
      setPhase("activity");
    } catch {
      setPhase("error");
    }
  }

  async function handleSubmit(answer) {
    const activity = activities[currentIdx];
    setPhase("evaluating");

    let result;
    try {
      result = await evaluateAnswer({
        activityType:  activity.type,
        prompt:        activity.prompt,
        correctAnswer: activity.correct_answer,
        studentAnswer: answer,
      });
    } catch {
      // Si falla la evaluación, marcar como correcta para no bloquear
      result = { is_correct: true, score: 100, explanation: "" };
    }

    const fullResult = {
      ...result,
      studentAnswer: answer,
      correctAnswer: activity.correct_answer,
    };

    setCurrentResult(fullResult);
    setResults((prev) => [...prev, { score: result.score }]);
    setPhase("feedback");

    // Persistir en Oracle (fire and forget)
    if (inscripcion) {
      saveActivityResult({
        idInscripcion:  inscripcion.idInscripcion,
        missionId,
        activityType:   activity.type,
        activityPrompt: activity.prompt,
        score:          result.score,
        studentAnswer:  answer,
        correctAnswer:  activity.correct_answer,
        isCorrect:      result.is_correct,
        aiExplanation:  result.explanation ?? null,
      });
    }
  }

  function handleNext() {
    if (currentIdx + 1 >= activities.length) {
      setPhase("summary");
    } else {
      setCurrentIdx((i) => i + 1);
      setCurrentResult(null);
      setPhase("activity");
    }
  }

  const averageScore =
    results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
      : previousScore ?? 0;

  const correctCount = results.filter((r) => r.score >= 100).length;

  // ── Renders ─────────────────────────────────────────────────────────────────

  if (!missionContent) {
    return (
      <div className="bg-zinc-900 rounded-3xl p-8 text-center space-y-6">
        <Loader2 size={32} className="text-zinc-600 mx-auto" />
        <div>
          <p className="text-white font-semibold">Actividades próximamente</p>
          <p className="text-zinc-400 text-sm mt-1">
            Las actividades de práctica para esta misión estarán disponibles pronto.
          </p>
        </div>
        <button
          onClick={() => onComplete(0)}
          className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-4 rounded-2xl transition-colors"
        >
          Continuar al Chat →
        </button>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="bg-zinc-900 rounded-3xl p-8 flex flex-col items-center gap-4 text-center">
        <Loader2 size={32} className="text-cyan-500 animate-spin" />
        <p className="text-zinc-400 text-sm">Generando actividades con IA...</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="bg-zinc-900 rounded-3xl p-8 space-y-6 text-center">
        <AlertCircle size={32} className="text-zinc-500 mx-auto" />
        <div>
          <p className="text-white font-semibold">No se pudieron cargar las actividades</p>
          <p className="text-zinc-400 text-sm mt-1">
            Puedes continuar directamente al chat con el tutor.
          </p>
        </div>
        <button
          onClick={() => onComplete(0)}
          className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-4 rounded-2xl transition-colors"
        >
          Ir al Chat →
        </button>
      </div>
    );
  }

  if (phase === "summary") {
    const passed = averageScore >= 60;
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-zinc-900 rounded-3xl p-8 space-y-6 text-center"
      >
        <Trophy size={40} className={`mx-auto ${passed ? "text-yellow-400" : "text-zinc-500"}`} />

        <div>
          <p className="text-white text-3xl font-bold">{averageScore}%</p>
          {results.length > 0 && (
            <p className="text-zinc-400 text-sm mt-1">
              {correctCount} de {activities.length} correctas
            </p>
          )}
          {isCompleted && previousScore !== null && (
            <p className="text-zinc-500 text-xs mt-1">Puntaje anterior: {previousScore}%</p>
          )}
        </div>

        <p className="text-zinc-300 text-sm">
          {passed
            ? "¡Buen trabajo! Estás listo para conversar con el tutor."
            : "Sigue practicando. El tutor te ayudará con lo que no quedó claro."}
        </p>

        {isCompleted && (
          <p className="text-zinc-500 text-xs">
            Ya completaste esta sección. Puedes repasar aquí o continuar al chat.
          </p>
        )}

        <button
          onClick={() => onComplete(averageScore)}
          className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-4 rounded-2xl transition-colors"
        >
          Continuar al Chat →
        </button>
      </motion.div>
    );
  }

  const currentActivity = activities[currentIdx];
  const isLast = currentIdx === activities.length - 1;

  return (
    <div className="space-y-4">
      {/* Progreso de actividades */}
      <div className="flex gap-2">
        {activities.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < currentIdx
                ? "bg-cyan-500"
                : i === currentIdx
                ? "bg-cyan-500/50"
                : "bg-zinc-800"
            }`}
          />
        ))}
      </div>

      {/* Tarjeta de actividad */}
      {(phase === "activity" || phase === "evaluating") && (
        <ActivityCard
          activity={currentActivity}
          activityNumber={currentIdx + 1}
          totalActivities={activities.length}
          onSubmit={handleSubmit}
          isEvaluating={phase === "evaluating"}
        />
      )}

      {/* Feedback */}
      {phase === "feedback" && currentResult && (
        <>
          <ActivityCard
            activity={currentActivity}
            activityNumber={currentIdx + 1}
            totalActivities={activities.length}
            onSubmit={() => {}}
            isEvaluating={false}
          />
          <ActivityFeedback
            isCorrect={currentResult.is_correct}
            score={currentResult.score}
            correctAnswer={currentResult.correctAnswer}
            studentAnswer={currentResult.studentAnswer}
            explanation={currentResult.explanation}
            onNext={handleNext}
            isLast={isLast}
          />
        </>
      )}
    </div>
  );
}
