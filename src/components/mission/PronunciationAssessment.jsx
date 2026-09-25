import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, RotateCcw, Trophy } from "lucide-react";

import useAuthStore from "../../store/authStore";
import { evaluatePronunciation } from "../../services/pronunciationService";
import { updateProgress } from "../../services/progressService";

const MAX_ATTEMPTS = 3;

function getReferenceText(missionContent) {
  if (missionContent?.examples?.length > 0) {
    return missionContent.examples[0].phrase;
  }
  return "Hello, my name is Luis. I am learning English and practicing every day.";
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

export default function PronunciationAssessment({
  missionContent = null,
  missionId,
  baseProgress = 80,
  onComplete,
  setProgress,
}) {
  const inscripcion = useAuthStore((state) => state.inscripcion);
  const referenceText = getReferenceText(missionContent);

  // 'ready' | 'recording' | 'evaluating' | 'results'
  const [phase, setPhase]         = useState("ready");
  const [attempts, setAttempts]   = useState(0);
  const [bestResult, setBestResult] = useState(null);
  const [currentResult, setCurrentResult] = useState(null);
  const [error, setError]         = useState(null);

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
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setCurrentResult(result);

        if (!bestResult || result.pronunciation_score > bestResult.pronunciation_score) {
          setBestResult(result);
        }

        setPhase("results");
      } catch {
        setError("No se pudo evaluar la pronunciación. Intenta de nuevo.");
        setPhase("ready");
      }
    };

    mediaRecorder.start();
    setTimeout(() => mediaRecorder.stop(), 5000);
  }

  async function handleComplete() {
    if (inscripcion && bestResult) {
      try {
        await updateProgress({
          idInscripcion: inscripcion.idInscripcion,
          missionId,
          progressPercent: 100,
          pronunciationScore: bestResult.pronunciation_score,
        });
      } catch { /* no bloquear */ }
    }
    setProgress?.(100);
    onComplete();
  }

  const canRetry = attempts < MAX_ATTEMPTS;

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
              {attempts > 0
                ? `Intento ${attempts} de ${MAX_ATTEMPTS}`
                : `Hasta ${MAX_ATTEMPTS} intentos — se guarda el mejor`}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Reference text */}
        <div className="bg-zinc-800 rounded-2xl p-5">
          <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Lee este texto en voz alta</p>
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
              key="results"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <ScoreBar label="Pronunciación" value={currentResult.pronunciation_score} color="text-cyan-400" />
              <ScoreBar label="Precisión"     value={currentResult.accuracy_score}      color="text-green-400" />
              <ScoreBar label="Fluidez"       value={currentResult.fluency_score}       color="text-yellow-400" />
              <ScoreBar label="Completitud"   value={currentResult.completeness_score}  color="text-purple-400" />

              {bestResult && attempts > 1 && (
                <p className="text-zinc-400 text-xs text-center pt-1">
                  Mejor intento: {Math.round(bestResult.pronunciation_score)} / 100
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div className="space-y-3">
          {/* Record / Re-record button */}
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

          {/* Complete mission */}
          {phase === "results" && (
            <button
              onClick={handleComplete}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2"
            >
              <Trophy size={18} />
              Completar Misión
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
