export default function ProgressCard({
  progress = 0,

  completed = 0,

  total = 0,
}) {
  return (
    <div
      className="
        bg-zinc-900/70
        backdrop-blur-xl
        border border-zinc-800
        rounded-3xl
        p-8
      "
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-zinc-400">Overall Progress</p>

          <h2 className="text-white text-3xl font-bold mt-3">{progress}%</h2>
        </div>

        {/* Circular Progress */}
        <div className="relative w-28 h-28">
          <div
            className="
              absolute inset-0
              rounded-full
              border-[10px]
              border-zinc-800
            "
          />

          <div
            className="
              absolute inset-0
              rounded-full
              border-[10px]
              border-cyan-500
              border-t-transparent
            "
            style={{
              transform: `rotate(${progress * 3.6}deg)`,
            }}
          />

          <div
            className="
              absolute inset-4
              bg-black
              rounded-full
            "
          />
        </div>
      </div>

      <div className="mt-8">
        <div className="flex justify-between mb-2">
          <span className="text-zinc-400 text-sm">Missions Completed</span>

          <span className="text-cyan-400 text-sm">
            {completed} / {total}
          </span>
        </div>

        <div className="w-full h-3 bg-zinc-800 rounded-full">
          <div
            className="
              h-full
              bg-cyan-500
              rounded-full
            "
            style={{
              width: `${progress}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
