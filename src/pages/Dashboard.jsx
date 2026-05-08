export default function Dashboard() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <h1 className="text-4xl font-bold mb-8">Activa Inglés</h1>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-zinc-900 rounded-2xl p-6 border border-cyan-500">
          <h2 className="text-2xl font-semibold">Misión 1</h2>

          <p className="text-zinc-400 mt-2">Presentarme en inglés</p>

          <button className="mt-4 bg-cyan-500 px-4 py-2 rounded-xl">
            Iniciar misión
          </button>
        </div>
      </div>
    </div>
  );
}
