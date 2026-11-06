// Imagen, audio o video de una sección o pregunta (URLs firmadas que entrega el backend)
export default function QuizMedia({ media, image }) {
  if (!media && !image) return null;

  return (
    <div className="flex flex-col gap-3">
      {image?.url && (
        <img
          src={image.url}
          alt="Imagen de la pregunta"
          loading="lazy"
          className="max-h-72 w-auto max-w-full rounded-xl border border-zinc-800 object-contain bg-zinc-950"
        />
      )}

      {media?.kind === "youtube" && (
        <div className="relative w-full overflow-hidden rounded-xl border border-zinc-800 pt-[56.25%]">
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${media.videoId}`}
            title="Video del quiz"
            allow="encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {media?.kind === "file" && media.mediaType === "AUDIO" && (
        media.url ? (
          <audio controls preload="none" src={media.url} className="w-full" />
        ) : (
          <p className="text-amber-400 text-sm">Falta subir el audio «{media.fileName}».</p>
        )
      )}

      {media?.kind === "file" && media.mediaType === "VIDEO" && (
        media.url ? (
          <video controls preload="none" src={media.url} className="w-full rounded-xl border border-zinc-800" />
        ) : (
          <p className="text-amber-400 text-sm">Falta subir el video «{media.fileName}».</p>
        )
      )}
    </div>
  );
}
