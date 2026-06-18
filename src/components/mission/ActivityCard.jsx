import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Loader2 } from "lucide-react";

// ── Tipos de actividad ────────────────────────────────────────────────────────

function FillBlankActivity({ prompt, answer, onAnswerChange }) {
  const parts = prompt.split("[___]");
  return (
    <p className="text-white text-lg leading-relaxed">
      {parts[0]}
      <input
        type="text"
        value={answer}
        onChange={(e) => onAnswerChange(e.target.value)}
        placeholder="..."
        className="inline-block mx-2 bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-1 text-cyan-300 focus:outline-none focus:border-cyan-500 w-28"
      />
      {parts[1]}
    </p>
  );
}

function TranslationActivity({ prompt, answer, onAnswerChange }) {
  return (
    <div className="space-y-4">
      <div className="bg-zinc-800 rounded-2xl p-4">
        <p className="text-zinc-400 text-xs mb-1">Traduce al inglés</p>
        <p className="text-white text-lg font-semibold">{prompt}</p>
      </div>
      <textarea
        value={answer}
        onChange={(e) => onAnswerChange(e.target.value)}
        placeholder="Write your translation here..."
        rows={3}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500 resize-none"
      />
    </div>
  );
}

function MultipleChoiceActivity({ options, answer, onAnswerChange }) {
  return (
    <div className="space-y-3">
      {options.map((opt, i) => (
        <button
          key={i}
          onClick={() => onAnswerChange(opt)}
          className={`w-full text-left px-4 py-3 rounded-2xl border transition-colors ${
            answer === opt
              ? "border-cyan-500 bg-cyan-500/10 text-white"
              : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ── Punto de dificultad ───────────────────────────────────────────────────────

const DIFFICULTY_COLOR = { easy: "bg-emerald-500", medium: "bg-yellow-500", hard: "bg-red-500" };

// ── ActivityCard ──────────────────────────────────────────────────────────────

export default function ActivityCard({ activity, activityNumber, totalActivities, onSubmit, isEvaluating }) {
  const [answer, setAnswer]       = useState("");
  const [showHint, setShowHint]   = useState(false);

  function handleSubmit() {
    if (!answer.trim() || isEvaluating) return;
    onSubmit(answer.trim());
  }

  return (
    <motion.div
      key={activity.id}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="bg-zinc-900 rounded-3xl p-8 space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-zinc-500 text-sm">
          Actividad {activityNumber} de {totalActivities}
        </p>
        <span
          className={`w-2.5 h-2.5 rounded-full ${DIFFICULTY_COLOR[activity.difficulty] ?? "bg-zinc-600"}`}
          title={activity.difficulty}
        />
      </div>

      {/* Prompt para fill_blank y multiple_choice */}
      {activity.type !== "translation" && activity.type !== "fill_blank" && (
        <p className="text-white text-lg leading-relaxed">{activity.prompt}</p>
      )}

      {/* Tipo de actividad */}
      {activity.type === "fill_blank" && (
        <FillBlankActivity
          prompt={activity.prompt}
          answer={answer}
          onAnswerChange={setAnswer}
        />
      )}
      {activity.type === "translation" && (
        <TranslationActivity
          prompt={activity.prompt}
          answer={answer}
          onAnswerChange={setAnswer}
        />
      )}
      {activity.type === "multiple_choice" && (
        <MultipleChoiceActivity
          options={activity.options ?? []}
          answer={answer}
          onAnswerChange={setAnswer}
        />
      )}

      {/* Pista */}
      {activity.hint && (
        <div>
          <button
            onClick={() => setShowHint((v) => !v)}
            className="flex items-center gap-1 text-zinc-500 text-xs hover:text-zinc-300 transition-colors"
          >
            <ChevronDown
              size={14}
              className={`transition-transform ${showHint ? "rotate-180" : ""}`}
            />
            {showHint ? "Ocultar pista" : "Ver pista"}
          </button>
          {showHint && (
            <p className="mt-2 text-amber-400 text-sm">{activity.hint}</p>
          )}
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!answer.trim() || isEvaluating}
        className={`w-full py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-colors ${
          answer.trim() && !isEvaluating
            ? "bg-cyan-500 hover:bg-cyan-400 text-black"
            : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
        }`}
      >
        {isEvaluating ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Evaluando...
          </>
        ) : (
          "Enviar respuesta"
        )}
      </button>
    </motion.div>
  );
}
