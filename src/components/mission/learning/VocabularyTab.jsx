import { useState } from "react";
import { motion } from "framer-motion";
import { Volume2 } from "lucide-react";
import { playText } from "../../../services/ttsService";

export default function VocabularyTab({ vocabulary }) {
  const [speaking, setSpeaking] = useState(null);

  async function handleSpeak(term, idx) {
    if (speaking === idx) return;
    setSpeaking(idx);
    try {
      await playText(term);
    } catch { /* TTS opcional */ }
    setSpeaking(null);
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {vocabulary.map((word, idx) => (
        <motion.div
          key={idx}
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
              onClick={() => handleSpeak(word.term, idx)}
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
      ))}
    </div>
  );
}
