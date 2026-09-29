import { useState } from "react";
import { motion } from "framer-motion";
import { Volume2 } from "lucide-react";
import { playText } from "../../../services/ttsService";

const ALL = "__all__";
const UNCATEGORIZED = "Otras palabras";

// Agrupa por categoría respetando el orden en que el académico las capturó.
// Las palabras sin categoría van al final en "Otras palabras".
function groupByCategory(vocabulary) {
  const groups = new Map();
  vocabulary.forEach((word, idx) => {
    const name = word.category?.trim() || UNCATEGORIZED;
    const key  = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, { key, name, words: [] });
    groups.get(key).words.push({ word, idx });
  });

  const list = [...groups.values()];
  const other = list.findIndex((g) => g.name === UNCATEGORIZED);
  if (other !== -1) list.push(...list.splice(other, 1));
  return list;
}

function WordCard({ word, idx, speaking, onSpeak }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="bg-zinc-800 rounded-2xl p-4 space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className="text-white font-bold text-lg">{word.term}</span>
          {word.part_of_speech && (
            <span className="ml-2 text-xs bg-zinc-700 text-zinc-400 px-2 py-0.5 rounded-full">
              {word.part_of_speech}
            </span>
          )}
        </div>
        <button
          onClick={() => onSpeak(word.term, idx)}
          className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
            speaking === idx
              ? "text-cyan-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Volume2 size={16} />
        </button>
      </div>

      {word.definition && (
        <p className="text-zinc-400 text-sm">{word.definition}</p>
      )}
      {word.example && (
        <p className="text-zinc-500 text-xs italic">"{word.example}"</p>
      )}
    </motion.div>
  );
}

export default function VocabularyTab({ vocabulary }) {
  const [speaking, setSpeaking] = useState(null);
  const [activeGroup, setActiveGroup] = useState(ALL);

  async function handleSpeak(term, idx) {
    if (speaking === idx) return;
    setSpeaking(idx);
    try {
      await playText(term);
    } catch { /* TTS opcional */ }
    setSpeaking(null);
  }

  const groups = groupByCategory(vocabulary);
  const hasCategories = groups.some((g) => g.name !== UNCATEGORIZED);

  // Sin categorías: la vista de siempre
  if (!hasCategories) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {vocabulary.map((word, idx) => (
          <WordCard key={idx} word={word} idx={idx} speaking={speaking} onSpeak={handleSpeak} />
        ))}
      </div>
    );
  }

  const visibleGroups =
    activeGroup === ALL ? groups : groups.filter((g) => g.key === activeGroup);

  return (
    <div className="space-y-6">
      {/* Filtro por categoría */}
      <div className="flex flex-wrap gap-2">
        {[{ key: ALL, name: "Todas", words: vocabulary }, ...groups].map((group) => (
          <button
            key={group.key}
            onClick={() => setActiveGroup(group.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              activeGroup === group.key
                ? "border-cyan-500 bg-cyan-500/10 text-cyan-300"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            }`}
          >
            {group.name}
            <span className="ml-1.5 text-zinc-500">{group.words.length}</span>
          </button>
        ))}
      </div>

      {visibleGroups.map((group) => (
        <section key={group.key} className="space-y-3">
          <h4 className="text-cyan-400 text-xs font-semibold uppercase tracking-wider">
            {group.name}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {group.words.map(({ word, idx }) => (
              <WordCard key={idx} word={word} idx={idx} speaking={speaking} onSpeak={handleSpeak} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
