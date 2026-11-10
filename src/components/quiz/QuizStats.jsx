import { useEffect, useState } from "react";

import { Loader2, RefreshCw } from "lucide-react";

import { getQuizStats } from "../../services/quizService";
import { QUESTION_TYPE_LABELS } from "../../utils/quizFormat";

function rateColor(rate) {
  if (rate == null) return { bar: "bg-zinc-700", text: "text-zinc-500" };
  if (rate >= 80) return { bar: "bg-green-500", text: "text-green-300" };
  if (rate >= 50) return { bar: "bg-amber-500", text: "text-amber-300" };
  return { bar: "bg-red-500", text: "text-red-300" };
}

function Tile({ label, value, hint }) {
  return (
    <div className="rounded-xl bg-zinc-900/70 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

const pct = (value) => (value == null ? "—" : `${Math.round(value)}%`);

// Resultados de los estudiantes en una versión del quiz (por defecto la publicada)
export default function QuizStats({ quizId, versions }) {
  const withResults = versions.filter((v) => v.status !== "BORRADOR");
  const published = withResults.find((v) => v.status === "PUBLICADA");
  const [versionId, setVersionId] = useState(published?.versionId ?? withResults[0]?.versionId ?? null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hardestFirst, setHardestFirst] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!versionId) return;
    let active = true;
    async function load() {
      try {
        const result = await getQuizStats(quizId, versionId);
        if (active) {
          setData(result);
          setError("");
        }
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [quizId, versionId, reloadKey]);

  if (!versionId) {
    return <p className="text-sm text-zinc-500">Los resultados aparecen cuando publiques una versión.</p>;
  }

  const questions = [...(data?.questions ?? [])];
  if (hardestFirst) {
    questions.sort((a, b) => (a.successRate ?? 101) - (b.successRate ?? 101) || a.number - b.number);
  }
  const hard = questions.filter((q) => q.successRate != null && q.successRate < 50).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {withResults.length > 1 && (
          <select
            value={versionId}
            onChange={(e) => {
              setLoading(true);
              setVersionId(Number(e.target.value));
            }}
            className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            aria-label="Versión"
          >
            {withResults.map((v) => (
              <option key={v.versionId} value={v.versionId}>
                Versión {v.versionNumber}
                {v.status === "PUBLICADA" ? " (publicada)" : ""}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setReloadKey((k) => k + 1);
          }}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-cyan-300 hover:bg-zinc-800"
        >
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 size={22} className="animate-spin text-cyan-500" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-300">{error}</p>
      ) : !data?.attempts ? (
        <p className="text-sm text-zinc-500">
          Todavía ningún estudiante ha entregado la versión {data?.versionNumber}.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Intentos entregados" value={data.attempts} hint={`${data.students} estudiantes`} />
            <Tile label="Promedio" value={pct(data.avgScore)} hint={`Más alta ${pct(data.maxScore)} · más baja ${pct(data.minScore)}`} />
            <Tile label="Aprobados" value={pct(data.passRate)} hint={`se aprueba con ${data.passingScore}%`} />
            <Tile
              label="Preguntas difíciles"
              value={hard}
              hint={hard ? "menos de 50 % de acierto" : "ninguna bajo 50 %"}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-white">Acierto por pregunta</p>
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={hardestFirst}
                onChange={(e) => setHardestFirst(e.target.checked)}
                className="accent-cyan-500"
              />
              Más difíciles primero
            </label>
          </div>

          <ul className="flex flex-col gap-2">
            {questions.map((q) => {
              const color = rateColor(q.successRate);
              return (
                <li key={q.questionKey} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-500">
                        Pregunta {q.number} · {q.section} · {QUESTION_TYPE_LABELS[q.type] ?? q.type}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-white">{q.prompt}</p>
                    </div>
                    <p className={`shrink-0 text-lg font-semibold ${color.text}`}>{pct(q.successRate)}</p>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
                    <div className={`h-full ${color.bar}`} style={{ width: `${q.successRate ?? 0}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {q.answers
                      ? `${q.correct} correctas${q.partial ? `, ${q.partial} parciales` : ""} de ${q.answers} respuestas`
                      : "Nadie la ha contestado"}
                  </p>
                </li>
              );
            })}
          </ul>

          <p className="text-xs text-zinc-500">
            Una pregunta con poco acierto puede estar redactada de forma confusa o señalar un tema que conviene
            reforzar. Si la corriges en el Word y publicas una versión nueva, sus resultados se cuentan por separado.
          </p>
        </>
      )}
    </div>
  );
}
