import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

function GrammarRule({ grammar }) {
  const dos   = (grammar.dos ?? []).filter((item) => item?.trim());
  const donts = (grammar.donts ?? []).filter((item) => item?.trim());

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
      {(dos.length > 0 || donts.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {dos.length > 0 && (
            <div className="bg-emerald-950/50 border border-emerald-800/40 rounded-2xl p-4">
              <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-3">
                Correcto
              </p>
              <ul className="space-y-2">
                {dos.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 size={15} className="text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-zinc-300 text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {donts.length > 0 && (
            <div className="bg-red-950/50 border border-red-800/40 rounded-2xl p-4">
              <p className="text-red-400 text-xs font-semibold uppercase tracking-wider mb-3">
                Evitar
              </p>
              <ul className="space-y-2">
                {donts.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <XCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
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

export default function GrammarTab({ rules = [] }) {
  const [active, setActive] = useState(0);

  if (rules.length === 0) {
    return <p className="text-zinc-500 text-sm">Sin contenido gramatical.</p>;
  }

  if (rules.length === 1) {
    return <GrammarRule grammar={rules[0]} />;
  }

  const current = Math.min(active, rules.length - 1);

  return (
    <div className="space-y-6">
      {/* Una pestaña por regla */}
      <div className="flex flex-wrap gap-2">
        {rules.map((rule, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              current === i
                ? "border-cyan-500 bg-cyan-500/10 text-cyan-300"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            }`}
          >
            {rule.title?.trim() || `Regla ${i + 1}`}
          </button>
        ))}
      </div>

      <GrammarRule grammar={rules[current]} />
    </div>
  );
}
