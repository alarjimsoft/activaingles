import { useState } from "react";
import { motion } from "framer-motion";
import { Mic, RotateCcw, ArrowRight, Volume2, CheckCircle2, XCircle, SpellCheck } from "lucide-react";

import useAuthStore from "../../store/authStore";
import { evaluatePronunciation } from "../../services/pronunciationService";
import { spellingToText } from "../../services/speechService";
import { updateProgress } from "../../services/progressService";
import { playText } from "../../services/ttsService";

const WORD_COUNT     = 6;
const MAX_ATTEMPTS   = 3; // por palabra
const RECORD_SECONDS = 8;

// Palabras A1 para cuando el vocabulario de la misión no tiene suficientes palabras deletreables
const FALLBACK_WORDS = [
  { term: "name", definition: "nombre" },
  { term: "teacher", definition: "maestro" },
  { term: "student", definition: "estudiante" },
  { term: "friend", definition: "amigo" },
  { term: "book", definition: "libro" },
  { term: "school", definition: "escuela" },
  { term: "family", definition: "familia" },
  { term: "mother", definition: "madre" },
  { term: "father", definition: "padre" },
  { term: "sister", definition: "hermana" },
  { term: "brother", definition: "hermano" },
  { term: "house", definition: "casa" },
  { term: "city", definition: "ciudad" },
  { term: "phone", definition: "teléfono" },
  { term: "water", definition: "agua" },
  { term: "apple", definition: "manzana" },
  { term: "table", definition: "mesa" },
  { term: "chair", definition: "silla" },
  { term: "pencil", definition: "lápiz" },
  { term: "class", definition: "clase" },
  { term: "happy", definition: "feliz" },
  { term: "green", definition: "verde" },
  { term: "seven", definition: "siete" },
  { term: "hello", definition: "hola" },
];

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Palabras del vocabulario que se pueden deletrear (una palabra, solo letras, 2+ letras);
// si no alcanzan, se completa con la lista A1.
function pickWords(missionContent) {
  const fromVocab = (missionContent?.vocabulary ?? [])
    .filter((v) => /^[A-Za-z]{2,12}$/.test(v.term?.trim() ?? ""))
    .map((v) => ({ term: v.term.trim(), definition: v.definition }));

  const seen = new Set();
  return [...shuffle(fromVocab), ...shuffle(FALLBACK_WORDS)]
    .filter((w) => {
      const key = w.term.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, WORD_COUNT);
}

const spelled = (word) => word.toUpperCase().split("").join("-");

// Dos señales:
// - Google (sin conocer la palabra) dice QUÉ letras se dijeron. Azure con la palabra
//   como referencia tiende a "escuchar" la correcta (FA-C-HER pasaba como FATHER).
// - Azure (con las letras como referencia) confirma que se DELETREÓ: si el estudiante
//   dice la palabra completa, Google la transcribe igual ("father") pero Azure da muy bajo.
// azure = null si su llamada falló: no se bloquea al estudiante por eso.
function gradeSpelling(target, heard, azure) {
  if (!heard) {
    return { correct: false, score: 0, heard: "", message: "No te escuchamos bien. Di cada letra despacio." };
  }

  // Azure muy bajo en puntaje y completitud: no hubo deletreo (p. ej. dijo "city" y Google dio "CT")
  const clearlyNotSpelled =
    azure?.success &&
    (azure.pronunciation_score ?? 0) < 50 &&
    (azure.completeness_score ?? 0) < 50;
  if (clearlyNotSpelled) {
    return {
      correct: false,
      score: 0,
      heard: "",
      message: `Parece que dijiste la palabra completa. Deletréala letra por letra: ${spelled(target)}.`,
    };
  }

  if (heard === target) {
    const spelledOut =
      azure === null ||
      (azure.success &&
        ((azure.completeness_score ?? 0) >= 80 || (azure.pronunciation_score ?? 0) >= 80));

    if (!spelledOut) {
      return {
        correct: false,
        score: 0,
        heard: "",
        message: `Parece que dijiste la palabra completa. Deletréala letra por letra: ${spelled(target)}.`,
      };
    }
    return { correct: true, score: 100, heard, message: "¡Muy bien! Lo deletreaste correctamente." };
  }

  // Puntaje parcial: letras en su lugar, máximo 60
  const inPlace = [...target].filter((letter, i) => heard[i] === letter).length;
  return {
    correct: false,
    score: Math.round((inPlace / Math.max(target.length, heard.length)) * 60),
    heard,
    message: "Casi. Revisa las letras marcadas en rojo.",
  };
}

function LetterRow({ target, heard }) {
  const length = Math.max(target.length, heard.length);
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length }, (_, i) => {
        const letter = heard[i] ?? "_";
        const ok = heard[i] === target[i];
        return (
          <span
            key={i}
            className={`w-8 h-9 flex items-center justify-center rounded-lg font-mono font-bold ${
              ok ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
            }`}
          >
            {letter}
          </span>
        );
      })}
    </div>
  );
}

function scoreColor(score) {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}

export default function SpellingAssessment({
  missionContent = null,
  missionId,
  baseProgress = 50,
  phaseWeight = 50,
  onComplete,
  setProgress,
}) {
  const inscripcion = useAuthStore((state) => state.inscripcion);
  const [words] = useState(() => pickWords(missionContent));

  // 'ready' | 'recording' | 'evaluating' | 'results' | 'summary'
  const [phase, setPhase]       = useState("ready");
  const [wordIdx, setWordIdx]   = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [results, setResults]   = useState([]); // por palabra: { score, correct }
  const [error, setError]       = useState(null);
  const [saving, setSaving]     = useState(false);

  const word         = words[wordIdx];
  const target       = word.term.toUpperCase();
  const isLastWord   = wordIdx === words.length - 1;
  const canRetry     = attempts < MAX_ATTEMPTS && !feedback?.correct;

  const averageScore =
    results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + (r?.score ?? 0), 0) / words.length)
      : 0;

  async function startRecording() {
    setError(null);
    setPhase("recording");

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("No se pudo acceder al micrófono.");
      setPhase("ready");
      return;
    }

    const mediaRecorder = new MediaRecorder(stream);
    const chunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const audioBlob = new Blob(chunks, { type: "audio/webm" });
      setPhase("evaluating");

      try {
        // En paralelo: letras dichas (Google) y confirmación de deletreo (Azure, letras separadas)
        const [spelling, azure] = await Promise.all([
          spellingToText(audioBlob),
          evaluatePronunciation(audioBlob, target.split("").join(" ")).catch(() => null),
        ]);
        const graded = gradeSpelling(target, spelling.letters ?? "", azure);
        setAttempts((a) => a + 1);
        setFeedback(graded);
        setResults((prev) => {
          const next = [...prev];
          const best = next[wordIdx];
          next[wordIdx] = {
            score: Math.max(best?.score ?? 0, graded.score),
            correct: Boolean(best?.correct || graded.correct),
          };
          return next;
        });
        setPhase("results");
      } catch {
        setError("No se pudo evaluar. Intenta de nuevo.");
        setPhase("ready");
      }
    };

    mediaRecorder.start();
    setTimeout(() => mediaRecorder.stop(), RECORD_SECONDS * 1000);
  }

  function handleNextWord() {
    if (isLastWord) {
      setPhase("summary");
      return;
    }
    setWordIdx((i) => i + 1);
    setAttempts(0);
    setFeedback(null);
    setPhase("ready");
  }

  async function handleComplete() {
    const progressPercent = Math.round(baseProgress + phaseWeight);
    setSaving(true);
    if (inscripcion) {
      try {
        await updateProgress({
          idInscripcion: inscripcion.idInscripcion,
          missionId,
          progressPercent,
          pronunciationScore: averageScore,
        });
      } catch { /* no bloquear */ }
    }
    setProgress?.(progressPercent);
    onComplete();
  }

  // ── Resumen ─────────────────────────────────────────────────────────────────

  if (phase === "summary") {
    const correctCount = results.filter((r) => r?.correct).length;
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-zinc-900 rounded-3xl p-6 sm:p-8 space-y-6"
      >
        <div className="text-center">
          <SpellCheck size={36} className="text-cyan-400 mx-auto" />
          <p className={`text-3xl font-bold mt-3 ${scoreColor(averageScore)}`}>
            {averageScore} / 100
          </p>
          <p className="text-zinc-400 text-sm mt-1">
            {correctCount} de {words.length} palabras deletreadas correctamente
          </p>
        </div>

        <ul className="space-y-2">
          {words.map((w, i) => (
            <li
              key={w.term}
              className="flex items-center justify-between gap-4 bg-zinc-800 rounded-xl px-4 py-3"
            >
              <span className="flex items-center gap-2 text-zinc-200 text-sm font-mono">
                {results[i]?.correct ? (
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                ) : (
                  <XCircle size={16} className="text-red-400 shrink-0" />
                )}
                {spelled(w.term)}
              </span>
              <span className={`text-sm font-semibold shrink-0 ${scoreColor(results[i]?.score ?? 0)}`}>
                {results[i]?.score ?? 0}
              </span>
            </li>
          ))}
        </ul>

        <button
          onClick={handleComplete}
          disabled={saving}
          className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 text-black font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2"
        >
          Continuar
          <ArrowRight size={18} />
        </button>
      </motion.div>
    );
  }

  // ── Palabra actual ──────────────────────────────────────────────────────────

  return (
    <div className="bg-zinc-900 rounded-3xl overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="bg-cyan-500 p-3 rounded-2xl">
            <SpellCheck className="text-black" size={20} />
          </div>
          <div>
            <h2 className="text-white text-xl font-bold">Deletrea la palabra</h2>
            <p className="text-zinc-400 text-sm">
              Palabra {wordIdx + 1} de {words.length}
              {attempts > 0 && ` · Intento ${attempts} de ${MAX_ATTEMPTS}`}
            </p>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          {words.map((w, i) => (
            <div
              key={w.term}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < wordIdx ? "bg-cyan-500" : i === wordIdx ? "bg-cyan-500/50" : "bg-zinc-800"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Palabra */}
        <div className="bg-zinc-800 rounded-2xl p-5 text-center space-y-2">
          <p className="text-zinc-400 text-xs uppercase tracking-wider">
            Di cada letra en inglés, una por una
          </p>
          <div className="flex items-center justify-center gap-3">
            <p className="text-white text-3xl font-bold tracking-widest">{target}</p>
            <button
              onClick={() => playText(word.term).catch(() => {})}
              aria-label="Escuchar la palabra"
              className="p-2 rounded-xl text-zinc-400 hover:text-cyan-400 hover:bg-zinc-700 transition-colors"
            >
              <Volume2 size={20} />
            </button>
          </div>
          {word.definition && <p className="text-zinc-400 text-sm">({word.definition})</p>}
        </div>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        {/* Retroalimentación */}
        {phase === "results" && feedback && (
          <motion.div
            key={`feedback-${wordIdx}-${attempts}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl p-4 space-y-3 border ${
              feedback.correct
                ? "bg-emerald-950/50 border-emerald-700/40"
                : "bg-red-950/40 border-red-700/40"
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.correct ? (
                <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
              ) : (
                <XCircle size={20} className="text-red-400 shrink-0" />
              )}
              <p className={`font-semibold ${feedback.correct ? "text-emerald-300" : "text-red-300"}`}>
                {feedback.message}
              </p>
            </div>

            {!feedback.correct && feedback.heard && (
              <div className="space-y-2">
                <p className="text-zinc-400 text-xs">Escuchamos:</p>
                <LetterRow target={target} heard={feedback.heard} />
                <p className="text-zinc-400 text-xs pt-1">
                  Correcto: <span className="text-emerald-300 font-mono">{spelled(target)}</span>
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* Acciones */}
        <div className="space-y-3">
          {phase === "ready" && (
            <button
              onClick={startRecording}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2"
            >
              <Mic size={18} />
              Grabar ({RECORD_SECONDS} segundos)
            </button>
          )}

          {phase === "recording" && (
            <div className="w-full bg-red-500/20 border border-red-500/40 text-red-400 font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 animate-pulse">
              <Mic size={18} />
              Grabando... deletrea ahora
            </div>
          )}

          {phase === "evaluating" && (
            <div className="w-full bg-zinc-800 text-zinc-400 font-semibold py-4 rounded-2xl flex items-center justify-center gap-2">
              Evaluando...
            </div>
          )}

          {phase === "results" && canRetry && (
            <button
              onClick={() => setPhase("ready")}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold py-3 rounded-2xl transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw size={16} />
              Intentar de nuevo
            </button>
          )}

          {phase === "results" && (
            <button
              onClick={handleNextWord}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2"
            >
              {isLastWord ? "Ver resultado" : "Siguiente palabra"}
              <ArrowRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
