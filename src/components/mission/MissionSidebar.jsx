import { Target, BookOpen, Trophy } from "lucide-react";

export default function MissionSidebar({ mission, progress = 0 }) {
  return (
    <div
      className="
        bg-zinc-900/70
        backdrop-blur-xl
        border border-zinc-800
        rounded-3xl
        p-6
        h-fit
      "
    >
      <h2 className="text-white text-2xl font-bold mb-8">Mission Brief</h2>

      {/* Objectives */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Target className="text-cyan-400" />

          <h3 className="text-white font-semibold">Mission Information</h3>
        </div>

        <ul className="space-y-3 text-zinc-400 text-sm">
          <li>• Complete the mission conversation</li>

          <li>• Practice English expressions</li>

          <li>• Improve grammar and vocabulary</li>
        </ul>
      </div>

      {/* Grammar */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <BookOpen className="text-violet-400" />

          <h3 className="text-white font-semibold">Grammar Focus</h3>
        </div>

        <div
          className="
            bg-zinc-800
            rounded-2xl
            p-4
          "
        >
          <p className="text-cyan-400 text-sm font-semibold">
            {mission.grammarTitle}
          </p>

          <p className="text-zinc-400 text-xs mt-2">{mission.grammarExample}</p>
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <Trophy className="text-yellow-400" />

          <h3 className="text-white font-semibold">Progress</h3>
        </div>

        <div className="w-full h-3 bg-zinc-800 rounded-full">
          <div
            className="h-full bg-cyan-500 rounded-full"
            style={{
              width: `${progress}%`,
            }}
          ></div>
        </div>

        <p className="text-zinc-500 text-xs mt-3">{progress}% completed</p>
      </div>
    </div>
  );
}
