import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

export default function ObjectivesTab({ objectives }) {
  return (
    <div className="space-y-6">
      <motion.ul
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
        className="space-y-3"
      >
        {objectives.map((obj, i) => (
          <motion.li
            key={i}
            variants={{
              hidden: { opacity: 0, x: -16 },
              visible: { opacity: 1, x: 0 },
            }}
            className="flex items-start gap-3"
          >
            <CheckCircle2 size={20} className="text-cyan-500 mt-0.5 flex-shrink-0" />
            <span className="text-zinc-200 text-sm leading-relaxed">{obj}</span>
          </motion.li>
        ))}
      </motion.ul>

      <p className="text-zinc-500 text-xs italic">
        Domina estos objetivos al final de esta misión.
      </p>
    </div>
  );
}
