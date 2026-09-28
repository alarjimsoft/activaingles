import { Lightbulb } from "lucide-react";

import { motion } from "framer-motion";

export default function CorrectionCard({ correction }) {
  if (!correction) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 space-y-1"
    >
      <div className="flex items-center gap-2">
        <Lightbulb size={16} className="text-yellow-400 shrink-0" />
        <p className="text-yellow-300 text-sm font-semibold">Mejor dilo así:</p>
      </div>

      <p className="text-green-300 font-medium pl-6">{correction.corrected}</p>

      {correction.explanation && (
        <p className="text-zinc-400 text-sm pl-6">{correction.explanation}</p>
      )}
    </motion.div>
  );
}
