import { AlertTriangle } from "lucide-react";

import { motion } from "framer-motion";

export default function CorrectionCard({ correction }) {
  if (!correction) return null;

  return (
    <motion.div
      initial={{
        opacity: 0,
        y: 20,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      className="
        bg-yellow-500/10
        border border-yellow-500/20
        rounded-3xl
        p-5
        space-y-4
      "
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className="text-yellow-400" />

        <h3
          className="
            text-yellow-300
            font-semibold
          "
        >
          Grammar Correction
        </h3>
      </div>

      <div>
        <p className="text-zinc-400 text-sm mb-1">Original</p>

        <p className="text-red-300">{correction.original}</p>
      </div>

      <div>
        <p className="text-zinc-400 text-sm mb-1">Corrected</p>

        <p className="text-green-300">{correction.corrected}</p>
      </div>

      <div>
        <p className="text-zinc-400 text-sm mb-1">Explanation</p>

        <p className="text-zinc-200">{correction.explanation}</p>
      </div>
    </motion.div>
  );
}
