import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, BookMarked, Pencil, MessageSquare } from "lucide-react";

import ObjectivesTab from "./learning/ObjectivesTab";
import VocabularyTab from "./learning/VocabularyTab";
import GrammarTab    from "./learning/GrammarTab";
import ExamplesTab   from "./learning/ExamplesTab";

const TABS = [
  { key: "objectives", label: "Objetivos",  icon: BookOpen },
  { key: "vocabulary", label: "Vocabulario", icon: BookMarked },
  { key: "grammar",    label: "Gramática",   icon: Pencil },
  { key: "examples",   label: "Ejemplos",    icon: MessageSquare },
];

export default function LearningGuide({ missionContent, onComplete, isCompleted = false }) {
  if (!missionContent) {
    return (
      <div className="bg-zinc-900 rounded-3xl p-8 text-center space-y-6">
        <BookOpen size={32} className="text-zinc-600 mx-auto" />
        <div>
          <p className="text-white font-semibold">Contenido pedagógico próximamente</p>
          <p className="text-zinc-400 text-sm mt-1">
            El material de estudio para esta misión estará disponible pronto.
          </p>
        </div>
        <button
          onClick={onComplete}
          className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-4 rounded-2xl transition-colors"
        >
          Continuar a Práctica →
        </button>
      </div>
    );
  }
  const [activeTab, setActiveTab] = useState("objectives");
  const [visitedTabs, setVisitedTabs] = useState(
    () => new Set(isCompleted ? TABS.map((t) => t.key) : ["objectives"]),
  );

  function handleTabChange(key) {
    setActiveTab(key);
    setVisitedTabs((prev) => new Set([...prev, key]));
  }

  const allVisited = isCompleted || visitedTabs.size === TABS.length;

  return (
    <div className="bg-zinc-900 rounded-3xl overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-zinc-800">
        {TABS.map((tab) => {
          const Icon      = tab.icon;
          const isActive  = activeTab === tab.key;
          const isVisited = visitedTabs.has(tab.key);

          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex-1 flex flex-col items-center gap-1 py-4 transition-colors relative ${
                isActive
                  ? "text-cyan-400"
                  : isVisited
                  ? "text-zinc-300"
                  : "text-zinc-600"
              }`}
            >
              <Icon size={18} />
              <span className="text-xs font-medium">{tab.label}</span>
              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-500"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {activeTab === "objectives" && (
              <ObjectivesTab objectives={missionContent.objectives} />
            )}
            {activeTab === "vocabulary" && (
              <VocabularyTab vocabulary={missionContent.vocabulary} />
            )}
            {activeTab === "grammar" && (
              <GrammarTab grammar={missionContent.grammar} />
            )}
            {activeTab === "examples" && (
              <ExamplesTab examples={missionContent.examples} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Revisit notice */}
      {isCompleted && (
        <p className="text-zinc-500 text-xs text-center px-8 -mt-4 mb-2">
          Ya completaste esta sección. Puedes repasar el contenido aquí.
        </p>
      )}

      {/* Continue button */}
      <div className="px-8 pb-8">
        <button
          onClick={onComplete}
          disabled={!allVisited}
          className={`w-full py-4 rounded-2xl font-semibold transition-colors ${
            allVisited
              ? "bg-cyan-500 hover:bg-cyan-400 text-black"
              : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
          }`}
        >
          {allVisited
            ? "Continuar a Práctica →"
            : `Visita todos los tabs para continuar (${visitedTabs.size}/4)`}
        </button>
      </div>
    </div>
  );
}
