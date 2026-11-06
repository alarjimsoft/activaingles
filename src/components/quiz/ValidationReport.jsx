import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

// Reporte de la lectura del Word: resumen, errores (impiden publicar) y advertencias
export default function ValidationReport({ report }) {
  if (!report) return null;
  const errors = report.items.filter((i) => i.level === "error");
  const warnings = report.items.filter((i) => i.level === "warning");

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="flex items-center gap-2 text-sm text-white">
        <CheckCircle2 size={16} className="shrink-0 text-green-400" />
        {report.summary}
      </p>

      {errors.map((item, index) => (
        <p key={`e${index}`} className="flex items-start gap-2 text-sm text-red-300">
          <XCircle size={16} className="mt-0.5 shrink-0 text-red-400" />
          {item.message}
        </p>
      ))}

      {warnings.map((item, index) => (
        <p key={`w${index}`} className="flex items-start gap-2 text-sm text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
          {item.message}
        </p>
      ))}

      {errors.length > 0 && (
        <p className="mt-1 text-xs text-zinc-400">
          Corrige los errores (✖) en tu Word y vuelve a subirlo. Las advertencias no impiden publicar.
        </p>
      )}
    </div>
  );
}
