import { useCallback, useEffect, useState } from "react";

import { AnimatePresence } from "framer-motion";
import {
  BarChart3, CheckCircle2, ClipboardCheck, Download, Eye, FileText, Loader2, Music, Rocket, XCircle,
} from "lucide-react";

import DropZone from "./DropZone";
import QuizPreview from "./QuizPreview";
import QuizStats from "./QuizStats";
import ValidationReport from "./ValidationReport";
import {
  QUIZ_GUIDE_URL, QUIZ_TEMPLATE_URL, getAdminQuiz, getQuizDocxUrl, getQuizVersion,
  publishQuizVersion, uploadQuizDocx, uploadQuizMedia,
} from "../../services/quizService";
import useNotificationStore from "../../store/useNotificationStore";
import { formatDate } from "../../utils/quizFormat";

const STATUS_BADGE = {
  BORRADOR: "bg-amber-500/15 text-amber-300",
  PUBLICADA: "bg-green-500/15 text-green-300",
  ARCHIVADA: "bg-zinc-800 text-zinc-400",
};

const STATUS_LABEL = { BORRADOR: "Borrador", PUBLICADA: "Publicada", ARCHIVADA: "Archivada" };

function Card({ title, icon: Icon, children }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-semibold text-white">
        <Icon size={18} className="text-cyan-400" />
        {title}
      </h2>
      {children}
    </section>
  );
}

// Quiz con historial y la versión más reciente (con reporte, archivos y vista previa)
async function fetchQuizState(quizId) {
  const detail = await getAdminQuiz(quizId);
  const version = detail.versions.length ? await getQuizVersion(detail.versions[0].versionId) : null;
  return { detail, version };
}

const linkButton =
  "flex items-center justify-center gap-2 rounded-xl bg-zinc-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700";

// Panel del Content Manager para el quiz que va después de un tema
export default function QuizPanel({ quiz, onChanged }) {
  const addNotification = useNotificationStore((s) => s.addNotification);
  const notify = useCallback((type, title, message) => addNotification({ type, title, message }), [addNotification]);

  const [detail, setDetail] = useState(null);       // quiz con historial de versiones
  const [version, setVersion] = useState(null);     // versión más reciente (con reporte y vista previa)
  const [loading, setLoading] = useState(true);
  const [uploadingDocx, setUploadingDocx] = useState(false);
  const [rejected, setRejected] = useState(null);   // reporte de un Word con errores (no creó versión)
  const [mediaProgress, setMediaProgress] = useState({});
  const [mediaErrors, setMediaErrors] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // El padre monta un panel nuevo por quiz (key), así que el estado empieza limpio
  useEffect(() => {
    let active = true;
    async function loadInitial() {
      try {
        const state = await fetchQuizState(quiz.quizId);
        if (!active) return;
        setDetail(state.detail);
        setVersion(state.version);
      } catch (error) {
        if (active) notify("error", "No se pudo cargar el quiz", error.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadInitial();
    return () => {
      active = false;
    };
  }, [quiz.quizId, notify]);

  // Recarga después de subir, publicar, etc.
  async function load() {
    try {
      const state = await fetchQuizState(quiz.quizId);
      setDetail(state.detail);
      setVersion(state.version);
    } catch (error) {
      notify("error", "No se pudo actualizar el quiz", error.message);
    }
  }

  async function handleDocx([file]) {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      notify("error", "Archivo no válido", "Sube el quiz como documento de Word (.docx).");
      return;
    }
    setUploadingDocx(true);
    setRejected(null);
    setConfirmPublish(false);
    try {
      const result = await uploadQuizDocx(quiz.quizId, file);
      if (!result.created) {
        setRejected(result.report);
        notify("error", "El Word tiene errores", "Revisa el reporte, corrige el documento y vuelve a subirlo.");
        return;
      }
      notify(
        "success",
        `Versión ${result.versionNumber} creada`,
        result.pendingFiles.length
          ? `Falta subir: ${result.pendingFiles.join(", ")}.`
          : "Revisa la vista previa y publícala cuando esté lista.",
      );
      await load();
      onChanged?.();
    } catch (error) {
      notify("error", "No se pudo subir el Word", error.message);
    } finally {
      setUploadingDocx(false);
    }
  }

  async function handleMedia(files) {
    const pending = version?.pendingFiles ?? [];
    const errors = [];
    for (const file of files) {
      if (!pending.some((name) => name.toLowerCase() === file.name.toLowerCase())) {
        errors.push(`«${file.name}» no lo pide el Word. Archivos que faltan: ${pending.join(", ") || "ninguno"}.`);
        continue;
      }
      try {
        await uploadQuizMedia(version.versionId, file, (percent) =>
          setMediaProgress((prev) => ({ ...prev, [file.name]: percent })),
        );
      } catch (error) {
        errors.push(`«${file.name}»: ${error.message}`);
      }
    }
    setMediaErrors(errors);
    setMediaProgress({});
    await load();
    onChanged?.();
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      await publishQuizVersion(version.versionId);
      notify("success", "Quiz publicado", `Los estudiantes ya ven la versión ${version.versionNumber}.`);
      setConfirmPublish(false);
      await load();
      onChanged?.();
    } catch (error) {
      notify("error", "No se pudo publicar", error.message);
    } finally {
      setPublishing(false);
    }
  }

  async function handleDownload(versionId) {
    try {
      const { url } = await getQuizDocxUrl(versionId);
      window.location.assign(url);
    } catch (error) {
      notify("error", "No se pudo descargar el Word", error.message);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={28} className="animate-spin text-cyan-500" />
      </div>
    );
  }

  const isDraft = version?.status === "BORRADOR";
  const pendingFiles = version?.pendingFiles ?? [];
  const hasErrors = (version?.report?.errorCount ?? 0) > 0;
  const canPublish = isDraft && pendingFiles.length === 0 && !hasErrors;
  const published = detail?.versions.find((v) => v.status === "PUBLICADA");
  const uploading = Object.keys(mediaProgress).length > 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-8">
      {/* Encabezado */}
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
          <ClipboardCheck size={14} /> Quiz después del tema
        </p>
        <h1 className="mt-1 text-2xl font-bold text-white">{quiz.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Se desbloquea al terminar las misiones hasta «{quiz.afterTopicTitle}».{" "}
          {published
            ? `Publicada: versión ${published.versionNumber}.`
            : "Todavía no hay una versión publicada."}
        </p>
      </div>

      {/* 1. Plantilla */}
      <Card title="1. Escribe el quiz en Word" icon={FileText}>
        <p className="text-sm text-zinc-400">
          Usa la plantilla y sigue la guía. Para modificar el quiz, descarga el Word de la versión actual, corrígelo y
          vuelve a subirlo.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <a href={QUIZ_TEMPLATE_URL} download className={linkButton}>
            <Download size={16} /> Plantilla
          </a>
          <a href={QUIZ_GUIDE_URL} download className={linkButton}>
            <Download size={16} /> Guía
          </a>
          <button
            type="button"
            disabled={!version}
            onClick={() => handleDownload(version.versionId)}
            className={`${linkButton} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <Download size={16} /> Word actual
          </button>
        </div>
      </Card>

      {/* 2. Subir el Word */}
      <Card title="2. Sube el Word" icon={FileText}>
        <DropZone
          accept=".docx"
          onFiles={handleDocx}
          busy={uploadingDocx}
          title={uploadingDocx ? "Leyendo el Word…" : "Arrastra aquí el Word del quiz o haz clic para elegirlo"}
          hint="Documento de Word (.docx). Cada vez que lo subes se crea una versión nueva."
        />
        {rejected && (
          <>
            <p className="flex items-center gap-2 text-sm font-medium text-red-300">
              <XCircle size={16} /> No se creó la versión: el Word tiene errores.
            </p>
            <ValidationReport report={rejected} />
          </>
        )}
        {!rejected && version && (
          <>
            <p className="text-sm text-zinc-400">
              Versión {version.versionNumber} ·{" "}
              <span className={`rounded-md px-2 py-0.5 text-xs ${STATUS_BADGE[version.status]}`}>
                {STATUS_LABEL[version.status]}
              </span>{" "}
              · subida {formatDate(version.createdAt)}
            </p>
            <ValidationReport report={version.report} />
          </>
        )}
      </Card>

      {/* 3. Audios y videos */}
      {version && isDraft && (
        <Card title="3. Sube los audios y videos" icon={Music}>
          {pendingFiles.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-green-300">
              <CheckCircle2 size={16} /> Todos los archivos que pide el Word están subidos.
            </p>
          ) : (
            <>
              <p className="text-sm text-zinc-400">
                El Word menciona {pendingFiles.length === 1 ? "este archivo" : "estos archivos"}. Súbelos con el mismo
                nombre:
              </p>
              <ul className="flex flex-col gap-1">
                {pendingFiles.map((name) => (
                  <li key={name} className="flex items-center justify-between gap-3 text-sm text-white">
                    <span className="truncate">{name}</span>
                    {mediaProgress[name] !== undefined ? (
                      <span className="text-xs text-cyan-300">{mediaProgress[name]}%</span>
                    ) : (
                      <span className="text-xs text-amber-300">Falta</span>
                    )}
                  </li>
                ))}
              </ul>
              <DropZone
                accept=".mp3,.m4a,.wav,.mp4"
                multiple
                onFiles={handleMedia}
                busy={uploading}
                title={uploading ? "Subiendo…" : "Arrastra aquí los audios o videos"}
                hint="MP3, M4A, WAV (hasta 20 MB) o MP4 (hasta 200 MB)."
              />
            </>
          )}
          {mediaErrors.map((message) => (
            <p key={message} className="flex items-start gap-2 text-sm text-red-300">
              <XCircle size={16} className="mt-0.5 shrink-0" /> {message}
            </p>
          ))}
        </Card>
      )}

      {/* 4. Revisar y publicar */}
      {version && (
        <Card title={isDraft ? "4. Revisa y publica" : "Revisa el quiz"} icon={Rocket}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => setPreviewOpen(true)} className={`${linkButton} sm:flex-1`}>
              <Eye size={16} /> Vista previa (contestar como estudiante)
            </button>

            {isDraft &&
              (confirmPublish ? (
                <div className="flex gap-2 sm:flex-1">
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={publishing}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-green-400 disabled:opacity-60"
                  >
                    {publishing && <Loader2 size={16} className="animate-spin" />}
                    Sí, publicar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmPublish(false)}
                    className="rounded-xl bg-zinc-800 px-4 py-2.5 text-sm text-white hover:bg-zinc-700"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!canPublish}
                  onClick={() => setConfirmPublish(true)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-1"
                >
                  <Rocket size={16} /> Publicar versión {version.versionNumber}
                </button>
              ))}
          </div>
          {isDraft && !canPublish && (
            <p className="text-xs text-zinc-500">
              {hasErrors ? "Corrige los errores del Word para poder publicar." : "Sube los archivos que faltan para poder publicar."}
            </p>
          )}
          {confirmPublish && (
            <p className="text-xs text-zinc-400">
              Los estudiantes verán esta versión en sus próximos intentos. Las calificaciones anteriores se conservan.
            </p>
          )}
        </Card>
      )}

      {/* Resultados de los estudiantes */}
      {detail?.versions.some((v) => v.status !== "BORRADOR") && (
        <Card title="Resultados de los estudiantes" icon={BarChart3}>
          <QuizStats quizId={quiz.quizId} versions={detail.versions} />
        </Card>
      )}

      {/* Historial */}
      {detail?.versions.length > 0 && (
        <Card title="Historial de versiones" icon={FileText}>
          <ul className="flex flex-col divide-y divide-zinc-800">
            {detail.versions.map((v) => (
              <li key={v.versionId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-white">
                    Versión {v.versionNumber}{" "}
                    <span className={`ml-1 rounded-md px-2 py-0.5 text-xs ${STATUS_BADGE[v.status]}`}>
                      {STATUS_LABEL[v.status]}
                    </span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    {v.questionCount} preguntas · {v.uploadedByName || v.uploadedBy} · {formatDate(v.createdAt)}
                    {v.submittedAttempts > 0 && ` · ${v.submittedAttempts} intentos`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDownload(v.versionId)}
                  className="flex items-center gap-2 self-start rounded-lg px-3 py-1.5 text-xs text-cyan-300 hover:bg-zinc-800 sm:self-auto"
                >
                  <Download size={14} /> Word
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <AnimatePresence>
        {previewOpen && version && <QuizPreview version={version} onClose={() => setPreviewOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
