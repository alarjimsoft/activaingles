import { motion } from "framer-motion";
import { BookOpen, Zap, MessageCircle, Mic, Trophy, Check } from "lucide-react";

const PHASES = [
  { key: "learning",     label: "Aprendizaje",  icon: BookOpen },
  { key: "practice",     label: "Práctica",      icon: Zap },
  { key: "conversation", label: "Conversación",  icon: MessageCircle },
  { key: "assessment",   label: "Pronunciación", icon: Mic },
  { key: "completion",   label: "Completada",    icon: Trophy },
];

export default function MissionPhaseNavigator({ currentPhase, completedPhases = [], onPhaseClick }) {
  return (
    <div className="flex items-start w-full mb-10">
      {PHASES.map((phase, idx) => {
        const isCompleted = completedPhases.includes(phase.key);
        const isCurrent   = currentPhase === phase.key;
        const isLast      = idx === PHASES.length - 1;
        const Icon        = phase.icon;

        return (
          <div key={phase.key} className="flex items-center flex-1 min-w-0">
            {/* Step */}
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="relative">
                {isCurrent && (
                  <motion.div
                    animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                    className="absolute inset-0 rounded-full bg-cyan-500"
                  />
                )}
                <motion.button
                  onClick={() => isCompleted && onPhaseClick?.(phase.key)}
                  disabled={!isCompleted}
                  whileHover={isCompleted ? { scale: 1.1 } : {}}
                  whileTap={isCompleted ? { scale: 0.92 } : {}}
                  className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                    isCompleted
                      ? "bg-cyan-500 text-black cursor-pointer"
                      : isCurrent
                      ? "bg-cyan-500 text-black"
                      : "bg-zinc-800 text-zinc-600 cursor-default"
                  }`}
                >
                  {isCompleted ? (
                    <Check size={16} strokeWidth={3} />
                  ) : (
                    <Icon size={16} />
                  )}
                </motion.button>
              </div>

              <span
                className={`mt-2 text-xs font-medium text-center whitespace-nowrap ${
                  isCurrent
                    ? "text-cyan-400"
                    : isCompleted
                    ? "text-zinc-300"
                    : "text-zinc-600"
                }`}
              >
                {phase.label}
              </span>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div className="flex-1 h-px mx-3 mt-[-14px] bg-zinc-800 relative overflow-hidden">
                {isCompleted && (
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="absolute inset-0 bg-cyan-500 origin-left"
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
