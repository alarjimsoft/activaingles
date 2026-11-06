import { useCallback, useEffect, useRef, useState } from "react";

import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, ClipboardCheck, Clock3, Loader2, PlayCircle, RotateCcw, Send } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import QuizPlayer from "../components/quiz/QuizPlayer";
import QuizResults from "../components/quiz/QuizResults";
import MainLayout from "../layouts/MainLayout";
import { getAvailableQuizzes, getQuizAttempt, startQuiz, submitQuizAttempt } from "../services/quizService";
import useAuthStore from "../store/authStore";
import useNotificationStore from "../store/useNotificationStore";
import useStatsStore from "../store/useStatsStore";
import { isAnswered } from "../utils/quizFormat";

/* ── Respuestas en curso: se guardan en el navegador para no perderlas al recargar ── */
const answersKey = (attemptId) => `activa-quiz-respuestas-${attemptId}`;

function loadAnswers(attemptId) {
  try {
    return JSON.parse(localStorage.getItem(answersKey(attemptId)) || "{}");
  } catch {
    return {};
  }
}

function saveAnswers(attemptId, answers) {
  try {
    localStorage.setItem(answersKey(attemptId), JSON.stringify(answers));
  } catch {
    /* sin almacenamiento disponible: las respuestas siguen en memoria */
  }
}

function clearAnswers(attemptId) {
  try {
    localStorage.removeItem(answersKey(attemptId));
  } catch {
    /* nada que limpiar */
  }
}

function questionsOf(quiz) {
  return quiz?.sections.flatMap((section) => section.questions) ?? [];
}

/* ── Temporizador ──
   deadline: hora local en que vence el intento, ya corregida con la hora del servidor
   (así no depende de que el reloj del equipo del estudiante esté bien). */
function QuizTimer({ deadline, initialRemaining, onExpire }) {
  const expired = useRef(false);
  const [remaining, setRemaining] = useState(initialRemaining);

  useEffect(() => {
    const timer = setInterval(() => {
      const left = deadline - Date.now();
      setRemaining(left);
      if (left <= 0 && !expired.current) {
        expired.current = true;
        onExpire();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline, onExpire]);

  const seconds = Math.max(0, Math.floor(remaining / 1000));
  const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const urgent = seconds <= 60;
  return (
    <span
      className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold tabular-nums ${
        urgent ? "bg-red-500/15 text-red-300" : "bg-zinc-800 text-zinc-200"
      }`}
      aria-label={`Tiempo restante ${label}`}
    >
      <Clock3 size={15} /> {label}
    </span>
  );
}

export default function QuizPage() {
  const quizId = Number(useParams().id);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialAttempt = useRef(Number(searchParams.get("intento")) || null);
  const navigate = useNavigate();

  const inscripcion = useAuthStore((s) => s.inscripcion);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const fetchStats = useStatsStore((s) => s.fetchStats);
  const invalidateStats = useStatsStore((s) => s.invalidate);

  const [view, setView] = useState("loading"); // loading | intro | taking | result | error
  const [info, setInfo] = useState(null);       // estado del quiz para este estudiante
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const idInscripcion = inscripcion?.idInscripcion;

  function showAttempt(data) {
    const receivedAt = Date.now();
    const offset = data.serverNow ? Date.parse(data.serverNow) - receivedAt : 0;
    const deadline = data.expiresAt ? Date.parse(data.expiresAt) - offset : null;
    setAttempt({ ...data, deadline, initialRemaining: deadline ? deadline - receivedAt : null });
    if (data.status === "EN_CURSO") {
      setAnswers(loadAnswers(data.attemptId));
      setView("taking");
    } else {
      setView("result");
    }
  }

  async function refreshInfo() {
    const list = await getAvailableQuizzes(idInscripcion);
    const found = list.find((q) => q.quizId === quizId) ?? null;
    setInfo(found);
    return found;
  }

  useEffect(() => {
    if (!idInscripcion) return;
    let active = true;
    async function load() {
      try {
        const list = await getAvailableQuizzes(idInscripcion);
        const found = list.find((q) => q.quizId === quizId);
        if (!active) return;
        if (!found) {
          setErrorMessage("Este quiz no está disponible.");
          setView("error");
          return;
        }
        setInfo(found);
        if (initialAttempt.current) {
          const data = await getQuizAttempt(initialAttempt.current, idInscripcion);
          if (active) showAttempt(data);
        } else {
          setView("intro");
        }
      } catch (error) {
        if (!active) return;
        setErrorMessage(error.message);
        setView("error");
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [quizId, idInscripcion]);

  useEffect(() => {
    if (view === "taking" && attempt) saveAnswers(attempt.attemptId, answers);
  }, [answers, view, attempt]);

  async function handleStart() {
    setBusy(true);
    try {
      const data = await startQuiz(quizId, idInscripcion);
      setSearchParams({ intento: String(data.attemptId) }, { replace: true });
      showAttempt(data);
      window.scrollTo({ top: 0 });
    } catch (error) {
      addNotification({ type: "error", title: "No se pudo comenzar", message: error.message });
      await refreshInfo().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function submit(automatic = false) {
    if (!attempt || busy) return;
    setBusy(true);
    setConfirmSubmit(false);
    try {
      const data = await submitQuizAttempt(attempt.attemptId, idInscripcion, answers);
      clearAnswers(attempt.attemptId);
      showAttempt(data);
      window.scrollTo({ top: 0 });
      addNotification({
        type: data.result?.passed === "Y" ? "success" : "info",
        title: automatic ? "Se terminó el tiempo" : "Quiz entregado",
        message: `Obtuviste ${Math.round(data.result?.scorePercent ?? 0)}% y +${data.result?.xpEarned ?? 0} XP.`,
      });
      invalidateStats();
      fetchStats(idInscripcion);
      refreshInfo().catch(() => {});
    } catch (error) {
      if (error.code === "ATTEMPT_CLOSED") {
        // El tiempo ya había vencido: se muestra el intento como quedó en el servidor
        clearAnswers(attempt.attemptId);
        showAttempt(await getQuizAttempt(attempt.attemptId, idInscripcion));
        refreshInfo().catch(() => {});
        addNotification({ type: "warning", title: "Intento cerrado", message: error.message });
      } else {
        addNotification({ type: "error", title: "No se pudo entregar", message: `${error.message} Tus respuestas siguen guardadas.` });
      }
    } finally {
      setBusy(false);
    }
  }

  // El temporizador entrega con las respuestas más recientes (submit cambia en cada render)
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });
  const onExpire = useCallback(() => submitRef.current(true), []);

  /* ── Vistas ── */

  if (!inscripcion) {
    return (
      <MainLayout>
        <p className="p-10 text-zinc-400">Inicia sesión como estudiante para presentar el quiz.</p>
      </MainLayout>
    );
  }

  const backButton = (
    <button
      type="button"
      onClick={() => navigate("/dashboard")}
      className="mb-6 flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
    >
      <ArrowLeft size={16} /> Volver al Dashboard
    </button>
  );

  if (view === "loading") {
    return (
      <MainLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 size={30} className="animate-spin text-violet-400" />
        </div>
      </MainLayout>
    );
  }

  if (view === "error") {
    return (
      <MainLayout>
        {backButton}
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
          <AlertCircle size={36} className="text-red-400" />
          <p className="text-zinc-300">{errorMessage}</p>
        </div>
      </MainLayout>
    );
  }

  if (view === "intro") {
    const locked = info.status === "LOCKED";
    const inProgress = Boolean(info.inProgressAttemptId);
    const noAttemptsLeft = info.attemptsLeft === 0 && !inProgress;
    return (
      <MainLayout>
        {backButton}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-2xl rounded-3xl border border-violet-500/30 bg-linear-to-br from-violet-500/10 via-zinc-900 to-zinc-900 p-6 sm:p-8"
        >
          <ClipboardCheck size={34} className="text-violet-300" />
          <h1 className="mt-4 text-2xl font-bold text-white sm:text-3xl">{info.title}</h1>
          {info.versionTitle && info.versionTitle !== info.title && (
            <p className="mt-1 text-zinc-400">{info.versionTitle}</p>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
            {[
              ["Preguntas", info.questionCount],
              ["Puntos", info.totalPoints],
              ["Tiempo", info.timeLimitMinutes ? `${info.timeLimitMinutes} minutos` : "Sin límite"],
              ["Para aprobar", `${info.passingScore}%`],
              ["Intentos", info.maxAttempts ? `${info.attemptsUsed} de ${info.maxAttempts}` : `${info.attemptsUsed} (sin límite)`],
              ["Mejor calificación", info.bestScorePercent != null ? `${Math.round(info.bestScorePercent)}%` : "—"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-zinc-900/70 p-3">
                <dt className="text-xs text-zinc-500">{label}</dt>
                <dd className="mt-1 font-semibold text-white">{value}</dd>
              </div>
            ))}
          </dl>

          <ul className="mt-6 list-disc space-y-1 pl-5 text-sm text-zinc-400">
            {info.timeLimitMinutes && <li>El tiempo empieza a contar al comenzar y no se detiene si sales de la página.</li>}
            <li>Tus respuestas se guardan en este dispositivo mientras contestas.</li>
            <li>Cuenta tu mejor intento para el XP (hasta 200 XP).</li>
          </ul>

          <button
            type="button"
            disabled={locked || noAttemptsLeft || busy}
            onClick={handleStart}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-500 px-6 py-3.5 font-semibold text-white hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <PlayCircle size={18} />}
            {locked
              ? "Completa las misiones del tema para desbloquearlo"
              : noAttemptsLeft
                ? "Ya usaste todos tus intentos"
                : inProgress
                  ? "Continuar intento"
                  : info.attemptsUsed > 0
                    ? `Comenzar intento ${info.attemptsUsed + 1}`
                    : "Comenzar"}
          </button>
        </motion.div>
      </MainLayout>
    );
  }

  if (view === "taking") {
    const quiz = attempt.quiz;
    const all = questionsOf(quiz);
    const answered = all.filter((q) => isAnswered(q, answers[q.key])).length;
    const missing = all.length - answered;
    return (
      <MainLayout>
        <div className="mx-auto max-w-3xl">
          <div className="sticky top-0 z-20 -mx-4 mb-6 flex items-center justify-between gap-3 border-b border-zinc-800 bg-black/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{attempt.title}</p>
              <p className="text-xs text-zinc-500">
                Intento {attempt.attemptNumber} · {answered} de {all.length} respondidas
              </p>
            </div>
            {attempt.expiresAt && (
              <QuizTimer deadline={attempt.deadline} initialRemaining={attempt.initialRemaining} onExpire={onExpire} />
            )}
          </div>

          <QuizPlayer
            quiz={quiz}
            answers={answers}
            disabled={busy}
            onAnswer={(key, value) => setAnswers((prev) => ({ ...prev, [key]: value }))}
          />

          <div className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5">
            {confirmSubmit ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-amber-200">
                  {missing === 1 ? "Tienes 1 pregunta sin responder." : `Tienes ${missing} preguntas sin responder.`} ¿Entregar de
                  todos modos?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => submit()}
                    className="flex-1 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-400"
                  >
                    Sí, entregar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmSubmit(false)}
                    className="rounded-xl bg-zinc-800 px-4 py-2.5 text-sm text-white hover:bg-zinc-700"
                  >
                    Seguir contestando
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => (missing > 0 ? setConfirmSubmit(true) : submit())}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 font-semibold text-white hover:bg-violet-400 disabled:opacity-60"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                {busy ? "Calificando…" : "Entregar quiz"}
              </button>
            )}
          </div>
        </div>
      </MainLayout>
    );
  }

  // Resultado
  const canRetry = info && info.status !== "LOCKED" && info.attemptsLeft !== 0;
  return (
    <MainLayout>
      {backButton}
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-white">{attempt.title}</h1>
        <p className="mb-6 mt-1 text-sm text-zinc-500">
          Intento {attempt.attemptNumber}
          {attempt.status === "EXPIRADO" && " · se terminó el tiempo sin entregar"}
        </p>
        <QuizResults result={attempt.result} passingScore={attempt.passingScore} />
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="flex-1 rounded-2xl bg-zinc-800 px-6 py-3 font-semibold text-white hover:bg-zinc-700"
          >
            Volver al Dashboard
          </button>
          {canRetry && (
            <button
              type="button"
              onClick={() => {
                setSearchParams({}, { replace: true });
                setAttempt(null);
                setView("intro");
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-violet-500 px-6 py-3 font-semibold text-white hover:bg-violet-400"
            >
              <RotateCcw size={18} /> Intentar de nuevo
            </button>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
