import { motion } from "framer-motion";
import { CheckCircle2, XCircle, ArrowRight } from "lucide-react";

export default function ActivityFeedback({
  isCorrect,
  score,
  correctAnswer,
  studentAnswer,
  explanation,
  onNext,
  isLast,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`rounded-2xl p-6 space-y-4 ${
        isCorrect
          ? "bg-emerald-950/60 border border-emerald-700/40"
          : "bg-red-950/60 border border-red-700/40"
      }`}
    >
      {/* Resultado */}
      <div className="flex items-center gap-3">
        {isCorrect ? (
          <CheckCircle2 size={24} className="text-emerald-400 shrink-0" />
        ) : (
          <XCircle size={24} className="text-red-400 shrink-0" />
        )}
        <p className={`font-semibold text-lg ${isCorrect ? "text-emerald-300" : "text-red-300"}`}>
          {isCorrect ? "¡Correcto!" : "Casi, sigue practicando"}
        </p>
      </div>

      {/* Respuesta correcta si falló */}
      {!isCorrect && (
        <div className="bg-zinc-900/60 rounded-xl p-3">
          <p className="text-zinc-400 text-xs mb-1">Respuesta correcta</p>
          <p className="text-white font-medium">{correctAnswer}</p>
        </div>
      )}

      {/* Explicación de GPT */}
      {explanation && (
        <p className="text-zinc-300 text-sm leading-relaxed">{explanation}</p>
      )}

      {/* Botón siguiente */}
      <button
        onClick={onNext}
        className="w-full flex items-center justify-center gap-2 bg-zinc-700 hover:bg-zinc-600 text-white font-semibold py-3 rounded-2xl transition-colors"
      >
        {isLast ? "Ver resultados" : "Siguiente actividad"}
        <ArrowRight size={16} />
      </button>
    </motion.div>
  );
}
