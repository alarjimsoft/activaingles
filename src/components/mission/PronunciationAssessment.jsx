import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, RotateCcw, ArrowRight, MessageCircle } from "lucide-react";

import useAuthStore from "../../store/authStore";
import { evaluatePronunciation } from "../../services/pronunciationService";
import { updateProgress } from "../../services/progressService";

const PHRASE_COUNT  = 6;
const MAX_ATTEMPTS  = 2; // por frase

const FALLBACK_PHRASES = [
  "Hello, my name is Anna.",
  "Nice to meet you.",
  "How are you today?",
  "I am learning English every day.",
  "Where are you from?",
  "Have a nice day!",
];

// Frases de la misión: primero los ejemplos, luego las oraciones del vocabulario,
// y se completa con frases generales si la misión no tiene suficientes.
function getPracticePhrases(missionContent) {
  const candidates = [
    ...(missionContent?.examples ?? []).map((e) => e.phrase),
    ...(missionContent?.vocabulary ?? []).map((v) => v.example),
    ...FALLBACK_PHRASES,
  ];
  const unique = [...new Set(candidates.map((p) => p?.trim()).filter(Boolean))];
  return unique.slice(0, PHRASE_COUNT);
}

function ScoreBar({ label, value, color }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-zinc-300">{label}</span>
        <span className={`font-semibold ${color}`}>{Math.round(value)}</span>
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-2">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={`h-2 rounded-full ${color.replace("text-", "bg-")}`}
        />
      </div>
    </div>
  );
}

function scoreColor(score) {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}

export default function PronunciationAssessment({
  missionContent = null,
  missionId,
  baseProgress = 40,
  phaseWeight = 20,
  onComplete,
  setProgress,
}) {
  const inscripcion = useAuthStore((state) => state.inscripcion);
  const [phrases] = useState(() => getPracticePhrases(missionContent));

  // 'ready' | 'recording' | 'evaluating' | 'results' | 'summary'
  const [phase, setPhase]                 = useState("ready");
  const [phraseIdx, setPhraseIdx]         = useState(0);
  const [attempts, setAttempts]           = useState(0);
  const [currentResult, setCurrentResult] = useState(null);
  const [bestScores, setBestScores]       = useState([]);
  const [error, setError]                 = useState(null);
  const [saving, setSaving]               = useState(false);

  const referenceText = phrases[phraseIdx];
  const isLastPhrase  = phraseIdx === phrases.length - 1;
  const canRetry      = attempts < MAX_ATTEMPTS;

  const averageScore =
    bestScores.length > 0
      ? Math.round(bestScores.reduce((sum, s) => sum + s, 0) / bestScores.length)
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
        const result = await evaluatePronunciation(audioBlob, referenceText);
        setAttempts((a) => a + 1);
        setCurrentResult(result);
        setBestScores((prev) => {
          const next = [...prev];
          next[phraseIdx] = Math.max(next[phraseIdx] ?? 0, result.pronunciation_score);
          return next;
        });
        setPhase("results");
      } catch {
        setError("No se pudo evaluar la pronunciación. Intenta de nuevo.");
        setPhase("ready");
      }
    };

    mediaRecorder.start();
    setTimeout(() => mediaRecorder.stop(), 5000);
  }

  function handleNextPhrase() {
    if (isLastPhrase) {
      setPhase("summary");
      return;
    }
    setPhraseIdx((i) => i + 1);
    setAttempts(0);
    setCurrentResult(null);
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
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-zinc-900 rounded-3xl p-8 space-y-6"
      >
        <div className="text-center">
          <Mic size={36} className="text-cyan-400 mx-auto" />
          <p className={`text-3xl font-bold mt-3 ${scoreColor(averageScore)}`}>
            {averageScore} / 100
          </p>
          <p className="text-zinc-400 text-sm mt-1">Promedio de pronunciación</p>
        </div>

        <ul className="space-y-2">
          {phrases.map((phrase, i) => (
            <li
              key={phrase}
              className="flex items-center justify-between gap-4 bg-zinc-800 rounded-xl px-4 py-3"
            >
              <span className="text-zinc-200 text-sm">{phrase}</span>
              <span className={`text-sm font-semibold shrink-0 ${scoreColor(bestScores[i] ?? 0)}`}>
                {Math.round(bestScores[i] ?? 0)}
              </span>
            </li>
          ))}
        </ul>

        <button
          onClick={handleComplete}
          disabled={saving}
          className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 text-black font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2"
        >
          <MessageCircle size={18} />
          Continuar a Conversación →
        </button>
      </motion.div>
    );
  }

  // ── Frase actual ────────────────────────────────────────────────────────────

  return (
    <div className="bg-zinc-900 rounded-3xl overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="bg-cyan-500 p-3 rounded-2xl">
            <Mic className="text-black" size={20} />
          </div>
          <div>
            <h2 className="text-white text-xl font-bold">Evaluación de Pronunciación</h2>
            <p className="text-zinc-400 text-sm">
              Frase {phraseIdx + 1} de {phrases.length}
              {attempts > 0 && ` · Intento ${attempts} de ${MAX_ATTEMPTS}`}
            </p>
          </div>
        </div>

        {/* Progreso de frases */}
        <div className="flex gap-2 mt-4">
          {phrases.map((phrase, i) => (
            <div
              key={phrase}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < phraseIdx
                  ? "bg-cyan-500"
                  : i === phraseIdx
                  ? "bg-cyan-500/50"
                  : "bg-zinc-800"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Reference text */}
        <div className="bg-zinc-800 rounded-2xl p-5">
          <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Lee esta frase en voz alta</p>
          <p className="text-white text-lg leading-relaxed font-medium">"{referenceText}"</p>
        </div>

        {/* Error */}
        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}

        {/* Results */}
        <AnimatePresence mode="wait">
          {(phase === "results" && currentResult) && (
            <motion.div
              key={`results-${phraseIdx}-${attempts}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <ScoreBar label="Pronunciación" value={currentResult.pronunciation_score} color="text-cyan-400" />
              <ScoreBar label="Precisión"     value={currentResult.accuracy_score}      color="text-green-400" />
              <ScoreBar label="Fluidez"       value={currentResult.fluency_score}       color="text-yellow-400" />
              <ScoreBar label="Completitud"   value={currentResult.completeness_score}  color="text-purple-400" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div className="space-y-3">
          {phase === "ready" && (
            <button
              onClick={startRecording}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2"
            >
              <Mic size={18} />
              Grabar (5 segundos)
            </button>
          )}

          {phase === "recording" && (
            <div className="w-full bg-red-500/20 border border-red-500/40 text-red-400 font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 animate-pulse">
              <Mic size={18} />
              Grabando... (5 seg)
            </div>
          )}

          {phase === "evaluating" && (
            <div className="w-full bg-zinc-800 text-zinc-400 font-semibold py-4 rounded-2xl flex items-center justify-center gap-2">
              Evaluando pronunciación...
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
              onClick={handleNextPhrase}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2"
            >
              {isLastPhrase ? "Ver resultado" : "Siguiente frase"}
              <ArrowRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
