import { CheckCircle2, CircleDot, XCircle, Sparkles, Trophy } from "lucide-react";

import { correctAnswerText, pointsLabel, studentAnswerText } from "../../utils/quizFormat";

const STATUS = {
  Y: { icon: CheckCircle2, color: "text-green-400", border: "border-green-500/30", label: "Correcta" },
  P: { icon: CircleDot, color: "text-amber-400", border: "border-amber-500/30", label: "Parcial" },
  N: { icon: XCircle, color: "text-red-400", border: "border-red-500/30", label: "Incorrecta" },
};

function AnswerBlock({ label, text, tone = "text-zinc-300" }) {
  if (!text) return null;
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 whitespace-pre-line text-sm ${tone}`}>{text}</p>
    </div>
  );
}

/*
  result: { scorePoints, maxPoints, scorePercent, passed, xpEarned, revealAnswers?, questions[] }
  Las respuestas correctas solo llegan si el estudiante aprobó o ya no tiene intentos
  (en la vista previa del académico siempre llegan).
*/
export default function QuizResults({ result, passingScore }) {
  const passed = result.passed === "Y";
  const reveal = result.revealAnswers ?? true;

  return (
    <div className="flex flex-col gap-6">
      <div
        className={`rounded-2xl border p-5 sm:p-6 ${
          passed ? "border-green-500/30 bg-green-500/10" : "border-amber-500/30 bg-amber-500/10"
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Trophy size={28} className={passed ? "text-green-400" : "text-amber-400"} />
            <div>
              <p className="text-2xl font-bold text-white">{Math.round(result.scorePercent)}%</p>
              <p className="text-sm text-zinc-300">
                {pointsLabel(result.scorePoints)} de {result.maxPoints} ·{" "}
                {passed ? "Aprobado" : `Se aprueba con ${passingScore}%`}
              </p>
            </div>
          </div>
          <p className="flex items-center gap-2 text-lg font-semibold text-cyan-300">
            <Sparkles size={18} /> +{result.xpEarned} XP
          </p>
        </div>
        {!reveal && (
          <p className="mt-4 text-sm text-zinc-300">
            Las respuestas correctas se mostrarán cuando apruebes o ya no te queden intentos.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {result.questions.map((question) => {
          const status = STATUS[question.isCorrect] ?? STATUS.N;
          const Icon = status.icon;
          return (
            <article key={question.key} className={`rounded-2xl border bg-zinc-900/40 p-4 ${status.border}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-medium text-white">
                  <Icon size={16} className={status.color} />
                  Pregunta {question.number} · {status.label}
                </p>
                <span className="shrink-0 text-xs text-zinc-400">
                  {question.pointsEarned} / {question.pointsPossible}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-zinc-400">{question.prompt}</p>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <AnswerBlock label="Tu respuesta" text={studentAnswerText(question) || "Sin responder"} />
                <AnswerBlock label="Respuesta correcta" text={correctAnswerText(question)} tone="text-green-300" />
              </div>

              {question.aiFeedback && (
                <p className="mt-3 rounded-xl bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">{question.aiFeedback}</p>
              )}
              {question.feedback && (
                <p className="mt-3 rounded-xl bg-zinc-800/60 px-3 py-2 text-sm text-zinc-300">{question.feedback}</p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
