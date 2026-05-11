import { Lock, CheckCircle2, PlayCircle, Clock3, Sparkles } from "lucide-react";

export default function MissionCard({
  title,
  description,
  level,
  duration,
  status,
}) {
  const statusConfig = {
    active: {
      border: "border-cyan-500/40",
      glow: "shadow-cyan-500/10",
      icon: <PlayCircle className="text-cyan-400" size={28} />,
      button: "Start Mission",
      buttonStyle: "bg-cyan-500 hover:bg-cyan-400 text-black",
    },

    locked: {
      border: "border-zinc-800",
      glow: "",
      icon: <Lock className="text-zinc-500" size={28} />,
      button: "Locked",
      buttonStyle: "bg-zinc-800 text-zinc-500 cursor-not-allowed",
    },

    completed: {
      border: "border-emerald-500/40",
      glow: "shadow-emerald-500/10",
      icon: <CheckCircle2 className="text-emerald-400" size={28} />,
      button: "Completed",
      buttonStyle: "bg-emerald-500 hover:bg-emerald-400 text-black",
    },
  };

  const current = statusConfig[status];

  return (
    <div
      className={`
        relative
        bg-zinc-900/70
        backdrop-blur-xl
        border
        ${current.border}
        ${current.glow}
        rounded-3xl
        p-6
        transition-all
        duration-300
        hover:scale-[1.02]
        hover:shadow-2xl
      `}
    >
      {/* Top Section */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="text-cyan-400" size={18} />

            <span className="text-cyan-400 text-sm font-medium">Mission</span>
          </div>

          <h2 className="text-white text-2xl font-bold">{title}</h2>

          <p className="text-zinc-400 mt-3 leading-relaxed">{description}</p>
        </div>

        {current.icon}
      </div>

      {/* Bottom Info */}
      <div className="flex items-center gap-4 mt-6">
        <div
          className="
            flex items-center gap-2
            bg-zinc-800
            px-3 py-2
            rounded-xl
          "
        >
          <span className="text-xs text-zinc-400">{level}</span>
        </div>

        <div
          className="
            flex items-center gap-2
            bg-zinc-800
            px-3 py-2
            rounded-xl
          "
        >
          <Clock3 size={14} className="text-zinc-400" />

          <span className="text-xs text-zinc-400">{duration}</span>
        </div>
      </div>

      {/* Action Button */}
      <button
        className={`
          w-full
          mt-8
          py-4
          rounded-2xl
          font-semibold
          transition-all
          duration-300
          ${current.buttonStyle}
        `}
      >
        {current.button}
      </button>
    </div>
  );
}
