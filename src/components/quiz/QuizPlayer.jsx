import QuizMedia from "./QuizMedia";
import { pointsLabel } from "../../utils/quizFormat";

/* ─────────────────────────────────────────
   Tipos de pregunta
   Las respuestas tienen la forma que espera el backend:
   opción múltiple "a" · verdadero/falso true|false · completar "texto"
   relacionar { izquierda: derecha } · abierta "texto"
───────────────────────────────────────── */

function MultipleChoice({ question, value, onChange, disabled }) {
  return (
    <div className="flex flex-col gap-2">
      {question.options.map((option) => {
        const selected = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.key)}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
              selected
                ? "border-cyan-500 bg-cyan-500/10 text-white"
                : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600"
            }`}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold uppercase ${
                selected ? "bg-cyan-500 text-black" : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {option.key}
            </span>
            {option.text}
          </button>
        );
      })}
    </div>
  );
}

function TrueFalse({ value, onChange, disabled }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        { label: "Verdadero", value: true },
        { label: "Falso", value: false },
      ].map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.label}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
              selected
                ? "border-cyan-500 bg-cyan-500/10 text-white"
                : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function FillBlank({ question, value, onChange, disabled }) {
  const [before, after = ""] = question.prompt.split("___");
  return (
    <p className="text-lg leading-loose text-white">
      {before}
      <input
        type="text"
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Respuesta"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className="mx-1 w-36 border-b-2 border-cyan-500 bg-transparent px-1 text-center text-cyan-300 focus:outline-none"
      />
      {after}
    </p>
  );
}

function Matching({ question, value, onChange, disabled }) {
  const chosen = value ?? {};
  return (
    <div className="flex flex-col gap-2">
      {question.left.map((left) => (
        <div
          key={left}
          className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="text-sm text-white">{left}</span>
          <select
            value={chosen[left] ?? ""}
            disabled={disabled}
            onChange={(e) => onChange({ ...chosen, [left]: e.target.value })}
            className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 sm:w-56"
          >
            <option value="">Elige…</option>
            {question.right.map((right) => (
              <option key={right} value={right}>
                {right}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

function OpenAnswer({ value, onChange, disabled }) {
  const text = value ?? "";
  return (
    <div>
      <textarea
        rows={4}
        value={text}
        disabled={disabled}
        maxLength={2000}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Escribe tu respuesta en inglés…"
        className="w-full resize-y rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
      />
      <p className="mt-1 text-right text-xs text-zinc-600">{text.length}/2000</p>
    </div>
  );
}

const RENDERERS = {
  multiple_choice: MultipleChoice,
  true_false: TrueFalse,
  fill_blank: FillBlank,
  matching: Matching,
  open: OpenAnswer,
};

/* ─────────────────────────────────────────
   Quiz completo (vista del estudiante, sin respuestas)
───────────────────────────────────────── */
export default function QuizPlayer({ quiz, answers, onAnswer, disabled = false }) {
  return (
    <div className="flex flex-col gap-8">
      {quiz.instructions && (
        <p className="whitespace-pre-line rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
          {quiz.instructions}
        </p>
      )}

      {quiz.sections.map((section) => (
        <section key={section.key} className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 border-b border-zinc-800 pb-4">
            <h2 className="text-lg font-semibold text-white">
              <span className="text-cyan-400">Sección {section.number}.</span> {section.name}
            </h2>
            {section.instructions && (
              <p className="whitespace-pre-line text-sm text-zinc-400">{section.instructions}</p>
            )}
            <QuizMedia media={section.media} image={section.image} />
          </div>

          {section.questions.map((question) => {
            const Renderer = RENDERERS[question.type];
            const value = answers[question.key];
            return (
              <article
                key={question.key}
                className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Pregunta {question.number}
                  </p>
                  <span className="shrink-0 text-xs text-zinc-500">{pointsLabel(question.points)}</span>
                </div>

                {question.type !== "fill_blank" && (
                  <p className="whitespace-pre-line text-base text-white">{question.prompt}</p>
                )}
                <QuizMedia media={question.media} image={question.image} />

                <Renderer
                  question={question}
                  value={value}
                  disabled={disabled}
                  onChange={(next) => onAnswer(question.key, next)}
                />
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}
