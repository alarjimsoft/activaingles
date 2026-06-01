export default function StatCard({
  title,

  value,

  subtitle,
}) {
  return (
    <div
      className="
        bg-zinc-900/70
        backdrop-blur-xl
        border border-zinc-800
        rounded-3xl
        p-6

        min-h-[150px]

        flex
        flex-col
        justify-center

        transition
        hover:border-cyan-500/40
        hover:shadow-lg
        hover:shadow-cyan-500/10
      "
    >
      {/* Title */}
      <p
        className="
          text-zinc-300
          text-xs
          uppercase
          tracking-widest
          font-semibold
        "
      >
        {title}
      </p>

      {/* Value */}
      <h2
        className="
         text-white
         text-5xl
         font-black
         mt-3
         tracking-tight
         leading-none
        "
        style={{
          color: "#22d3ee",
          opacity: 1,
        }}
      >
        {value}
      </h2>

      {/* Subtitle */}
      <p
        className="
          text-cyan-300
          text-sm
          mt-4
        "
      >
        {subtitle}
      </p>
    </div>
  );
}
