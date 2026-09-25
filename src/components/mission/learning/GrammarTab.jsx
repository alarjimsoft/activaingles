import { CheckCircle2, XCircle } from "lucide-react";

export default function GrammarTab({ grammar }) {
  if (!grammar) {
    return <p className="text-zinc-500 text-sm">Sin contenido gramatical.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Título + fórmula */}
      <div>
        <h3 className="text-white text-xl font-bold">{grammar.title}</h3>
        {grammar.rule && (
          <div className="mt-2 bg-zinc-800 rounded-xl px-4 py-3 font-mono text-cyan-300 text-sm">
            {grammar.rule}
          </div>
        )}
      </div>

      {/* Explicación */}
      {grammar.explanation && (
        <p className="text-zinc-300 text-sm leading-relaxed">{grammar.explanation}</p>
      )}

      {/* DO / DON'T */}
      {(grammar.dos?.length > 0 || grammar.donts?.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {grammar.dos?.length > 0 && (
            <div className="bg-emerald-950/50 border border-emerald-800/40 rounded-2xl p-4">
              <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-3">
                Correcto
              </p>
              <ul className="space-y-2">
                {grammar.dos.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 size={15} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span className="text-zinc-300 text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {grammar.donts?.length > 0 && (
            <div className="bg-red-950/50 border border-red-800/40 rounded-2xl p-4">
              <p className="text-red-400 text-xs font-semibold uppercase tracking-wider mb-3">
                Evitar
              </p>
              <ul className="space-y-2">
                {grammar.donts.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <XCircle size={15} className="text-red-500 mt-0.5 flex-shrink-0" />
                    <span className="text-zinc-300 text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Nota adicional */}
      {grammar.note && (
        <div className="bg-amber-950/40 border border-amber-700/40 rounded-2xl p-4">
          <p className="text-amber-400 text-xs font-semibold uppercase tracking-wider mb-1">Nota</p>
          <p className="text-zinc-300 text-sm">{grammar.note}</p>
        </div>
      )}
    </div>
  );
}
