import { Target, BookOpen, Languages, Trophy } from "lucide-react";

export default function MissionSidebar({ mission }) {
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

          <h3 className="text-white font-semibold">Objectives</h3>
        </div>

        <ul className="space-y-3 text-zinc-400 text-sm">
          {mission.objectives.map((objective) => (
            <li key={objective}>• {objective}</li>
          ))}
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
          <p className="text-zinc-300 text-sm">
            <span className="text-cyan-400">{mission.grammar.title}</span>
          </p>

          <p className="text-zinc-500 text-xs mt-2">
            {mission.grammar.example}
          </p>
        </div>
      </div>

      {/* Vocabulary */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Languages className="text-emerald-400" />

          <h3 className="text-white font-semibold">Vocabulary</h3>
        </div>

        <div className="flex flex-wrap gap-2">
          {/*{["name", "student", "teacher", "engineer", "country"].map((word) => (*/}
          {mission.vocabulary.map((word) => (
            <span
              key={word}
              className="
                bg-zinc-800
                text-zinc-300
                px-3 py-2
                rounded-xl
                text-sm
              "
            >
              {word}
            </span>
          ))}
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
            style={{ width: `${mission.progress}%` }}
          ></div>
        </div>

        <p className="text-zinc-500 text-xs mt-3">
          {mission.progress}% completed
        </p>
      </div>
    </div>
  );
}
