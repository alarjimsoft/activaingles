export default function StatCard({ title, value, subtitle }) {
  return (
    <div
      className="
        bg-zinc-900/70
        backdrop-blur-xl
        border border-zinc-800
        rounded-3xl
        p-6
      "
    >
      <p className="text-zinc-400 text-sm">{title}</p>

      <h2 className="text-white text-4xl font-bold mt-3">{value}</h2>

      <p className="text-cyan-400 text-sm mt-2">{subtitle}</p>
    </div>
  );
}
