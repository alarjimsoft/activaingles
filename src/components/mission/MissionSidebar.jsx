import { Target, BookOpen, Trophy, BookMarked } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { DEFAULT_PHASES } from "../../config/missionPhases";

const PHASE_LABELS = {
  learning:     "Aprendizaje",
  practice:     "Práctica",
  assessment:   "Pronunciación",
  conversation: "Conversación",
  completion:   "Completada",
};

export default function MissionSidebar({ mission, progress = 0, currentPhase, phases = DEFAULT_PHASES, missionContent }) {
  const hasContent = !!missionContent;
  const phase      = currentPhase
    ? { label: PHASE_LABELS[currentPhase], step: phases.indexOf(currentPhase) + 1 }
    : null;

  const objectives =
    hasContent && missionContent.objectives?.length > 0
      ? missionContent.objectives
      : ["Complete the mission conversation", "Practice English expressions", "Improve grammar and vocabulary"];

  const contentRules = hasContent ? missionContent.grammarRules ?? [] : [];
  const grammarRules =
    contentRules.length > 0
      ? contentRules
      : mission.grammarTitle || mission.grammarExample
      ? [{ title: mission.grammarTitle, rule: mission.grammarExample }]
      : [];

  const vocabReminder = hasContent ? (missionContent.vocabulary ?? []).slice(0, 4) : [];

  return (
    <div className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-800 rounded-3xl p-6 h-fit space-y-8">
      <h2 className="text-white text-2xl font-bold">Mission Brief</h2>

      {/* Fase actual — solo misiones con contenido pedagógico */}
      {hasContent && phase && (
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPhase}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="bg-zinc-800 rounded-2xl p-4"
          >
            <p className="text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-1">
              Fase actual
            </p>
            <p className="text-white font-semibold">{phase.label}</p>
            <p className="text-zinc-500 text-xs mt-0.5">
              Paso {phase.step} de {phases.length}
            </p>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Objetivos */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <Target className="text-cyan-400" />
          <h3 className="text-white font-semibold">Mission Information</h3>
        </div>
        <ul className="space-y-3 text-zinc-400 text-sm">
          {objectives.map((obj, i) => (
            <li key={i}>• {obj}</li>
          ))}
        </ul>
      </div>

      {/* Gramática */}
      {grammarRules.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <BookOpen className="text-violet-400" />
            <h3 className="text-white font-semibold">Grammar Focus</h3>
          </div>
          <div className="space-y-2">
            {grammarRules.map((rule, i) => (
              <div key={i} className="bg-zinc-800 rounded-2xl p-4">
                {rule.title && (
                  <p className="text-cyan-400 text-sm font-semibold">{rule.title}</p>
                )}
                {rule.rule && (
                  <p className="text-zinc-400 text-xs mt-2">{rule.rule}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recordatorio de vocabulario */}
      {vocabReminder.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <BookMarked className="text-emerald-400" />
            <h3 className="text-white font-semibold">Vocabulario</h3>
          </div>
          <div className="space-y-2">
            {vocabReminder.map((word, i) => (
              <div key={i} className="flex items-start justify-between gap-2 text-sm">
                <span className="text-zinc-200 font-medium shrink-0">{word.term}</span>
                <span className="text-zinc-500 text-xs text-right">{word.definition}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progreso */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <Trophy className="text-yellow-400" />
          <h3 className="text-white font-semibold">Progress</h3>
        </div>
        <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-cyan-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
        <p className="text-zinc-500 text-xs mt-3">{progress}% completed</p>
      </div>
    </div>
  );
}
