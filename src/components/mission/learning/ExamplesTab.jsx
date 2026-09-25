import { useState } from "react";
import { Volume2 } from "lucide-react";
import { playText } from "../../../services/ttsService";

export default function ExamplesTab({ examples }) {
  const [speaking, setSpeaking] = useState(null);

  async function handleSpeak(text, key) {
    if (speaking === key) return;
    setSpeaking(key);
    try {
      await playText(text);
    } catch { /* TTS opcional */ }
    setSpeaking(null);
  }

  return (
    <div className="space-y-6">
      <p className="text-zinc-500 text-xs italic">
        Escucha y practica estas frases antes de chatear con el tutor.
      </p>

      {examples.map((ex, idx) => (
        <div key={idx} className="space-y-2">
          {ex.context && (
            <p className="text-zinc-500 text-xs italic">{ex.context}</p>
          )}

          {/* Frase del estudiante */}
          <div className="flex items-center gap-2">
            <p className="text-white font-semibold text-sm flex-1">{ex.phrase}</p>
            {ex.phrase && (
              <button
                onClick={() => handleSpeak(ex.phrase, `phrase-${idx}`)}
                className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                  speaking === `phrase-${idx}`
                    ? "text-cyan-400"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Volume2 size={14} />
              </button>
            )}
          </div>

          {/* Respuesta del tutor */}
          {ex.response && (
            <div className="ml-4 flex items-center gap-2 bg-zinc-800 rounded-2xl rounded-tl-none px-4 py-3">
              <p className="text-zinc-300 text-sm flex-1">{ex.response}</p>
              <button
                onClick={() => handleSpeak(ex.response, `response-${idx}`)}
                className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                  speaking === `response-${idx}`
                    ? "text-cyan-400"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Volume2 size={14} />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
