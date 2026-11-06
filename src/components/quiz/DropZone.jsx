import { useRef, useState } from "react";

import { Loader2, UploadCloud } from "lucide-react";

// Zona para arrastrar archivos o elegirlos con un clic
export default function DropZone({ accept, multiple = false, onFiles, title, hint, busy = false, disabled = false }) {
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);
  const blocked = busy || disabled;

  function handle(files) {
    const list = [...(files ?? [])];
    if (list.length && !blocked) onFiles(multiple ? list : [list[0]]);
  }

  return (
    <button
      type="button"
      disabled={blocked}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!blocked) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handle(e.dataTransfer.files);
      }}
      className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
        dragging
          ? "border-cyan-400 bg-cyan-500/10"
          : "border-zinc-700 bg-zinc-900/40 hover:border-zinc-500"
      } ${blocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      {busy ? (
        <Loader2 size={28} className="animate-spin text-cyan-400" />
      ) : (
        <UploadCloud size={28} className="text-cyan-400" />
      )}
      <span className="text-sm font-medium text-white">{title}</span>
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
      />
    </button>
  );
}
