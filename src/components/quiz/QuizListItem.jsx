import { ClipboardCheck } from "lucide-react";

// Estado del quiz en la lista del Content Manager (gris = sin quiz, ámbar = borrador, verde = publicado)
function quizStatus(quiz) {
  if (quiz.latestVersionStatus === "BORRADOR") {
    return { label: `Borrador v${quiz.latestVersionNumber}`, dot: "bg-amber-400", text: "text-amber-300" };
  }
  if (quiz.publishedVersionNumber) {
    return { label: `Publicado v${quiz.publishedVersionNumber}`, dot: "bg-green-400", text: "text-green-300" };
  }
  return { label: "Sin quiz", dot: "bg-zinc-600", text: "text-zinc-500" };
}

export default function QuizListItem({ quiz, selected, onSelect }) {
  const status = quizStatus(quiz);
  return (
    <button
      type="button"
      onClick={() => onSelect(quiz)}
      className={`mx-3 my-1 flex w-[calc(100%-1.5rem)] items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
        selected
          ? "border-cyan-500 bg-cyan-500/10"
          : "border-zinc-700/70 bg-zinc-800/40 hover:border-zinc-500"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <ClipboardCheck size={18} className="shrink-0 text-cyan-400" />
        <div className="min-w-0">
          <p className={`truncate text-sm font-semibold ${selected ? "text-cyan-300" : "text-white"}`}>{quiz.title}</p>
          <p className={`text-xs ${status.text}`}>{status.label}</p>
        </div>
      </div>
      <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} />
    </button>
  );
}
