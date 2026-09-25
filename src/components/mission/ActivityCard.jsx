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

const MATCH_COLORS = [
  "border-cyan-500 bg-cyan-500/10",
  "border-violet-500 bg-violet-500/10",
  "border-amber-500 bg-amber-500/10",
  "border-emerald-500 bg-emerald-500/10",
  "border-pink-500 bg-pink-500/10",
  "border-sky-500 bg-sky-500/10",
];

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// matches: { índice del par (izquierda) → texto elegido (derecha) }
function MatchingActivity({ pairs, matches, onMatchesChange }) {
  const [rights] = useState(() => shuffle(pairs.map((p) => p.right)));
  const [selectedLeft, setSelectedLeft] = useState(null);

  function handleRightClick(right) {
    if (selectedLeft === null) return;
    const next = Object.fromEntries(
      Object.entries(matches).filter(([, value]) => value !== right),
    );
    next[selectedLeft] = right;
    onMatchesChange(next);
    setSelectedLeft(null);
  }

  function leftIndexOf(right) {
    const entry = Object.entries(matches).find(([, value]) => value === right);
    return entry ? Number(entry[0]) : null;
  }

  const colorOf = (leftIdx) => MATCH_COLORS[leftIdx % MATCH_COLORS.length];

  return (
    <div className="space-y-3">
      <p className="text-zinc-500 text-xs">Toca una palabra y después su significado.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-3">
          {pairs.map((pair, i) => {
            const isSelected = selectedLeft === i;
            const isMatched  = matches[i] !== undefined;
            return (
              <button
                key={pair.left}
                onClick={() => setSelectedLeft(isSelected ? null : i)}
                className={`w-full text-left px-4 py-3 rounded-2xl border text-sm transition-colors ${
                  isSelected
                    ? "border-white bg-white/10 text-white"
                    : isMatched
                    ? `${colorOf(i)} text-white`
                    : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                }`}
              >
                {pair.left}
              </button>
            );
          })}
        </div>
        <div className="space-y-3">
          {rights.map((right) => {
            const leftIdx = leftIndexOf(right);
            return (
              <button
                key={right}
                onClick={() => handleRightClick(right)}
                disabled={selectedLeft === null}
                className={`w-full text-left px-4 py-3 rounded-2xl border text-sm transition-colors ${
                  leftIdx !== null
                    ? `${colorOf(leftIdx)} text-white`
                    : selectedLeft !== null
                    ? "border-zinc-500 text-zinc-200 hover:border-cyan-500"
                    : "border-zinc-700 text-zinc-400"
                }`}
              >
                {right}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Punto de dificultad ───────────────────────────────────────────────────────

const DIFFICULTY_COLOR = { easy: "bg-emerald-500", medium: "bg-yellow-500", hard: "bg-red-500" };

// ── ActivityCard ──────────────────────────────────────────────────────────────

export default function ActivityCard({ activity, activityNumber, totalActivities, onSubmit, isEvaluating }) {
  const [answer, setAnswer]       = useState("");
  const [showHint, setShowHint]   = useState(false);
  const [matches, setMatches]     = useState({});

  const isMatching = activity.type === "matching";
  const pairs      = activity.pairs ?? [];
  const canSubmit  = isMatching
    ? pairs.length > 0 && Object.keys(matches).length === pairs.length
    : answer.trim() !== "";

  function handleSubmit() {
    if (!canSubmit || isEvaluating) return;
    if (isMatching) {
      onSubmit(pairs.map((pair, i) => ({ left: pair.left, right: matches[i] })));
    } else {
      onSubmit(answer.trim());
    }
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
      {isMatching && (
        <MatchingActivity
          pairs={pairs}
          matches={matches}
          onMatchesChange={setMatches}
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
        disabled={!canSubmit || isEvaluating}
        className={`w-full py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-colors ${
          canSubmit && !isEvaluating
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
