import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Mic, Square, ArrowRight, CheckCircle2, XCircle, MessageCircle, Play, Volume2 } from "lucide-react";
import { TalkingHead } from "@met4citizen/talkinghead";
import { LipsyncEn } from "@met4citizen/talkinghead/modules/lipsync-en.mjs";

import useAuthStore from "../../store/authStore";
import { speakTextTimed } from "../../services/ttsService";
import { speechToText } from "../../services/speechService";
import { updateProgress } from "../../services/progressService";
import { startConversation, saveMessage } from "../../services/conversationService";
import { buildQuestions, isCorrectAnswer, practiceTopic, questionText } from "../../utils/phraseDrill";

const AVATAR_URL     = "/avatars/brunette.glb";
const MAX_ATTEMPTS   = 3;
const RECORD_SECONDS = 5;
// Puntaje de la frase según el intento en que acertó
const ATTEMPT_SCORES = [100, 70, 40];

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Palabra para calcular la forma de la boca: sin acentos ni signos («, ¿, ?)
const lipsyncWord = (word) =>
  word.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9']/g, "");

const withPeriod = (text) => (/[.?!]$/.test(text) ? text : `${text}.`);

/*
  Avatar 3D: carga brunette.glb y reproduce clips { buffer, words, wtimes }
  moviendo los labios. Si el navegador no puede mostrarlo, el audio se reproduce igual.
*/
function useTalkingHead(nodeRef) {
  const headRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error

  useEffect(() => {
    let cancelled = false;
    let head;

    try {
      head = new TalkingHead(nodeRef.current, {
        lipsyncModules: [], // el módulo se importa aquí; su carga dinámica no sobrevive al build
        lipsyncLang: "en",
        cameraView: "head",
        cameraDistance: 1,
        cameraY: 0.6, // cara y hombros
        cameraRotateEnable: false,
        avatarMood: "happy",
        avatarIdleEyeContact: 0.5,
        avatarSpeakingEyeContact: 0.9,
        avatarSpeakingHeadMove: 0.3,
      });
      head.lipsync.en = new LipsyncEn();
      headRef.current = head;
    } catch {
      queueMicrotask(() => !cancelled && setStatus("error"));
      return () => { cancelled = true; };
    }

    const loading = head
      .showAvatar({ url: AVATAR_URL, body: "F", avatarMood: "happy", lipsyncLang: "en" })
      .then(() => !cancelled && setStatus("ready"))
      .catch(() => !cancelled && setStatus("error"));

    // Pausar la animación con la pestaña oculta
    const onVisibility = () => (document.visibilityState === "visible" ? head.start() : head.stop());
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      headRef.current = null;
      // dispose() falla si el modelo no ha terminado de cargar: se libera al terminar
      loading.finally(() => {
        try { head.dispose(); } catch { /* ya liberado */ }
      });
    };
  }, [nodeRef]);

  return { headRef, status };
}

export default function AvatarConversation({
  missionContent = null,
  missionId,
  baseProgress = 60,
  phaseWeight = 40,
  setProgress,
  onComplete,
}) {
  const inscripcion = useAuthStore((state) => state.inscripcion);
  const [questions] = useState(() => buildQuestions(missionContent?.vocabulary));

  const avatarNodeRef = useRef(null);
  const { headRef, status: avatarStatus } = useTalkingHead(avatarNodeRef);

  // 'start' | 'talking' | 'listen' | 'recording' | 'evaluating' | 'summary'
  const [stage, setStage]       = useState("start");
  const [qIdx, setQIdx]         = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [feedback, setFeedback] = useState(null); // { type: correct|wrong|reveal|unheard, heard }
  const [results, setResults]   = useState([]);   // por pregunta: { correct, score, heard }
  const [caption, setCaption]   = useState("");
  const [error, setError]       = useState(null);
  const [saving, setSaving]     = useState(false);

  const clipCacheRef     = useRef(new Map());
  const fallbackAudioRef = useRef(null);
  const recorderRef      = useRef(null);
  const resultsRef       = useRef([]);
  const conversationRef  = useRef(null); // promesa del conversationId
  const logChainRef      = useRef(Promise.resolve());

  const question = questions[qIdx];
  const averageScore = Math.round(
    results.reduce((sum, r) => sum + (r?.score ?? 0), 0) / questions.length,
  );

  useEffect(() => () => {
    fallbackAudioRef.current?.pause();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  /* ── Voz del avatar ─────────────────────────────────────────────────────── */

  function getClip(text, language) {
    const key = `${language}|${text}`;
    if (!clipCacheRef.current.has(key)) {
      const clip = speakTextTimed(text, language).then(async (data) => {
        const head = headRef.current;
        const buffer = head
          ? await head.audioCtx.decodeAudioData(base64ToArrayBuffer(data.audio))
          : null;
        return { ...data, buffer };
      });
      clip.catch(() => clipCacheRef.current.delete(key));
      clipCacheRef.current.set(key, clip);
    }
    return clipCacheRef.current.get(key);
  }

  function playFallback(clip) {
    return new Promise((resolve) => {
      const audio = new Audio(`data:audio/mpeg;base64,${clip.audio}`);
      fallbackAudioRef.current = audio;
      audio.onended = resolve;
      audio.onerror = resolve;
      audio.play().catch(resolve);
    });
  }

  // segments: [{ text, language }] — se piden en paralelo y se dicen en orden
  async function say(segments) {
    setCaption(segments.map((s) => s.text).join(" "));
    let clips;
    try {
      clips = await Promise.all(segments.map((s) => getClip(s.text, s.language)));
    } catch {
      setError("No se pudo generar la voz del tutor. Revisa tu conexión.");
      return;
    }

    const head = headRef.current;
    if (avatarStatus !== "ready" || !head || clips.some((c) => !c.buffer)) {
      for (const clip of clips) await playFallback(clip);
      return;
    }

    const totalMs = clips.reduce((sum, c) => sum + c.buffer.duration * 1000, 0);
    head.makeEyeContact(totalMs + 500);

    for (const clip of clips) {
      const durationMs = clip.buffer.duration * 1000;
      const words = [];
      const wtimes = [];
      const wdurations = [];
      clip.words.forEach((word, i) => {
        const lip = lipsyncWord(word);
        if (!lip) return;
        const start = clip.wtimes[i];
        const end = clip.wtimes[i + 1] ?? durationMs;
        words.push(lip);
        wtimes.push(start);
        wdurations.push(Math.max(80, end - start));
      });
      head.speakAudio({ audio: clip.buffer, words, wtimes, wdurations }, { lipsyncLang: "en" });
    }
    await new Promise((resolve) => head.speakMarker(resolve));
  }

  /* ── Registro en Oracle (CONVERSATIONS / CONVERSATION_MESSAGES) ─────────── */

  function log(sender, messageText, correction = null) {
    logChainRef.current = logChainRef.current.then(async () => {
      const conversationId = await conversationRef.current;
      if (!conversationId) return;
      await saveMessage({ conversationId, sender, messageText, correction }).catch(() => {});
    });
  }

  /* ── Flujo ──────────────────────────────────────────────────────────────── */

  async function handleStart() {
    // El audio solo puede arrancar dentro de un clic
    headRef.current?.audioCtx.resume();
    setError(null);
    setStage("talking");

    conversationRef.current = inscripcion
      ? startConversation({ idInscripcion: inscripcion.idInscripcion, missionId })
          .then((r) => r.conversationId)
          .catch(() => null)
      : Promise.resolve(null);

    const intro =
      `¡Hola! Qué gusto verte. Hoy vamos a practicar ${practiceTopic(missionContent?.vocabulary)} en inglés. ` +
      "Yo te voy a decir una frase en español y tú me vas a decir cómo se dice en inglés. " +
      "Cuando termine de hablar, presiona el micrófono y responde en voz alta. " +
      "Si te equivocas, tienes dos oportunidades más. ¡Empecemos!";

    // La primera pregunta se va preparando mientras habla la introducción
    getClip(questionText(questions[0]), "es").catch(() => {});
    log("tutor", intro);
    await say([{ text: intro, language: "es" }]);
    await askQuestion(0);
  }

  async function askQuestion(idx) {
    setQIdx(idx);
    setAttempts(0);
    setFeedback(null);
    setStage("talking");

    const text = questionText(questions[idx]);
    log("tutor", text);
    await say([{ text, language: "es" }]);
    setStage("listen");

    // Siguiente pregunta lista antes de que haga falta
    if (questions[idx + 1]) getClip(questionText(questions[idx + 1]), "es").catch(() => {});
  }

  async function startRecording() {
    setError(null);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("No se pudo acceder al micrófono.");
      return;
    }

    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      evaluate(new Blob(chunks, { type: "audio/webm" }));
    };

    recorder.start();
    setStage("recording");
    headRef.current?.makeEyeContact(RECORD_SECONDS * 1000);
    setTimeout(() => recorder.state === "recording" && recorder.stop(), RECORD_SECONDS * 1000);
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  async function evaluate(audioBlob) {
    setStage("evaluating");

    let heard;
    try {
      heard = ((await speechToText(audioBlob)).transcript ?? "").trim();
    } catch {
      setError("No se pudo revisar tu respuesta. Intenta de nuevo.");
      setStage("listen");
      return;
    }

    // Sin voz no cuenta como intento
    if (!heard) {
      setFeedback({ type: "unheard", heard });
      setStage("talking");
      await say([{ text: "No te escuché bien. Inténtalo otra vez.", language: "es" }]);
      setStage("listen");
      return;
    }

    log("student", heard);
    const attempt = attempts + 1;
    setAttempts(attempt);

    if (isCorrectAnswer(heard, question.accepted)) {
      saveResult({ correct: true, score: ATTEMPT_SCORES[attempt - 1], heard });
      setFeedback({ type: "correct", heard });
      setStage("talking");
      log("tutor", `¡Correcto! ${question.answer}`);
      await say([
        { text: "¡Correcto!", language: "es" },
        { text: withPeriod(question.answer), language: "en" },
      ]);
      await nextQuestion();
      return;
    }

    if (attempt < MAX_ATTEMPTS) {
      const reply =
        attempt === 1
          ? "No es correcto. Inténtalo otra vez."
          : "Todavía no. Tienes una oportunidad más.";
      setFeedback({ type: "wrong", heard });
      setStage("talking");
      log("tutor", reply);
      await say([{ text: reply, language: "es" }]);
      setStage("listen");
      return;
    }

    saveResult({ correct: false, score: 0, heard });
    setFeedback({ type: "reveal", heard });
    setStage("talking");
    log("tutor", `La respuesta correcta es: ${question.answer}`, {
      original: heard,
      corrected: question.answer,
      explanation: `«${question.spanish}» en inglés se dice «${question.answer}».`,
    });
    await say([
      { text: "La respuesta correcta es", language: "es" },
      { text: withPeriod(question.answer), language: "en" },
    ]);
    await nextQuestion();
  }

  function saveResult(result) {
    resultsRef.current[qIdx] = result;
    setResults([...resultsRef.current]);
  }

  async function nextQuestion() {
    if (qIdx < questions.length - 1) {
      await askQuestion(qIdx + 1);
      return;
    }

    const correctCount = resultsRef.current.filter((r) => r?.correct).length;
    const closing =
      `¡Terminamos! Acertaste ${correctCount} de ${questions.length} frases. ` +
      (correctCount >= questions.length / 2 ? "¡Muy buen trabajo!" : "Sigue practicando, vas muy bien.");
    setFeedback(null);
    setStage("summary");
    log("tutor", closing);
    await say([{ text: closing, language: "es" }]);
  }

  async function handleComplete() {
    const progressPercent = Math.round(baseProgress + phaseWeight);
    setSaving(true);
    headRef.current?.stopSpeaking();
    fallbackAudioRef.current?.pause();
    if (inscripcion) {
      try {
        await updateProgress({
          idInscripcion: inscripcion.idInscripcion,
          missionId,
          progressPercent,
          grammarScore: averageScore,
          totalMessages: resultsRef.current.filter(Boolean).length,
        });
      } catch { /* no bloquear */ }
    }
    setProgress?.(progressPercent);
    onComplete();
  }

  /* ── Vista ──────────────────────────────────────────────────────────────── */

  return (
    <div className="bg-zinc-900 rounded-3xl overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="bg-cyan-500 p-3 rounded-2xl">
            <MessageCircle className="text-black" size={20} />
          </div>
          <div>
            <h2 className="text-white text-xl font-bold">Conversación con tu tutor</h2>
            <p className="text-zinc-400 text-sm">
              {stage === "start" || stage === "summary"
                ? `${questions.length} frases · ${MAX_ATTEMPTS} oportunidades en cada una`
                : `Frase ${qIdx + 1} de ${questions.length}` +
                  (attempts > 0 ? ` · Intento ${attempts} de ${MAX_ATTEMPTS}` : "")}
            </p>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          {questions.map((q, i) => (
            <div
              key={`${q.spanish}-${q.context}`}
              className={`h-1 flex-1 rounded-full transition-colors ${
                results[i]?.correct
                  ? "bg-emerald-500"
                  : results[i]
                  ? "bg-red-500"
                  : i === qIdx && stage !== "start"
                  ? "bg-cyan-500/50"
                  : "bg-zinc-800"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Avatar */}
      <div className="relative h-64 sm:h-80 bg-gradient-to-b from-zinc-800 to-zinc-950">
        {/* Sin eventos: los controles de cámara de three.js bloquean el scroll táctil del celular */}
        <div ref={avatarNodeRef} className="absolute inset-0 pointer-events-none" />

        {avatarStatus === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-400 text-sm">
            Cargando a tu tutor...
          </div>
        )}
        {avatarStatus === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-400 text-sm px-6 text-center">
            <Volume2 size={28} className="text-cyan-400" />
            Tu dispositivo no pudo mostrar al tutor, pero puedes escucharlo y practicar igual.
          </div>
        )}

        {caption && stage !== "start" && (
          <motion.p
            key={caption}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-3 left-3 right-3 bg-black/70 text-zinc-100 text-sm rounded-xl px-4 py-2 text-center"
          >
            {caption}
          </motion.p>
        )}
      </div>

      <div className="p-6 space-y-5">
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        {/* Inicio */}
        {stage === "start" && (
          <div className="space-y-4 text-center">
            <p className="text-zinc-300 text-sm">
              Tu tutor te dirá frases en español y tú respondes en inglés con tu voz.
              Activa el sonido de tu dispositivo.
            </p>
            <button
              onClick={handleStart}
              disabled={avatarStatus === "loading"}
              className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 text-black font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2"
            >
              <Play size={18} />
              {avatarStatus === "loading" ? "Cargando..." : "Comenzar práctica"}
            </button>
          </div>
        )}

        {/* Pregunta */}
        {stage !== "start" && stage !== "summary" && question && (
          <motion.div
            key={qIdx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-zinc-800 rounded-2xl p-5 text-center space-y-2"
          >
            <p className="text-zinc-400 text-xs uppercase tracking-wider">¿Cómo se dice en inglés?</p>
            <p className="text-white text-3xl font-bold">{question.spanish}</p>
            {question.context && <p className="text-cyan-300 text-sm">{question.context}</p>}
          </motion.div>
        )}

        {/* Retroalimentación */}
        {feedback && stage !== "summary" && (
          <motion.div
            key={`feedback-${qIdx}-${attempts}-${feedback.type}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl p-4 space-y-1 border ${
              feedback.type === "correct"
                ? "bg-emerald-950/50 border-emerald-700/40"
                : "bg-red-950/40 border-red-700/40"
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === "correct" ? (
                <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
              ) : (
                <XCircle size={20} className="text-red-400 shrink-0" />
              )}
              <p className={`font-semibold ${feedback.type === "correct" ? "text-emerald-300" : "text-red-300"}`}>
                {feedback.type === "correct" && "¡Correcto!"}
                {feedback.type === "wrong" && `No es correcto. Te quedan ${MAX_ATTEMPTS - attempts} oportunidades.`}
                {feedback.type === "reveal" && `La respuesta correcta es «${question.answer}».`}
                {feedback.type === "unheard" && "No te escuchamos bien. Inténtalo otra vez."}
              </p>
            </div>
            {feedback.heard && (
              <p className="text-zinc-400 text-sm">
                Escuchamos: <span className="text-zinc-200">«{feedback.heard}»</span>
              </p>
            )}
          </motion.div>
        )}

        {/* Acciones */}
        {stage === "talking" && (
          <div className="w-full bg-zinc-800 text-zinc-400 font-semibold py-4 rounded-2xl flex items-center justify-center gap-2">
            <Volume2 size={18} className="animate-pulse" />
            Tu tutor está hablando...
          </div>
        )}

        {stage === "listen" && (
          <button
            onClick={startRecording}
            className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            <Mic size={18} />
            Responder en inglés
          </button>
        )}

        {stage === "recording" && (
          <button
            onClick={stopRecording}
            className="w-full bg-red-500/20 border border-red-500/40 text-red-300 font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 animate-pulse"
          >
            <Square size={16} />
            Grabando... toca para terminar
          </button>
        )}

        {stage === "evaluating" && (
          <div className="w-full bg-zinc-800 text-zinc-400 font-semibold py-4 rounded-2xl flex items-center justify-center gap-2">
            Revisando tu respuesta...
          </div>
        )}

        {/* Resumen */}
        {stage === "summary" && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-cyan-400">{averageScore} / 100</p>
              <p className="text-zinc-400 text-sm mt-1">
                {results.filter((r) => r?.correct).length} de {questions.length} frases correctas
              </p>
            </div>

            <ul className="space-y-2">
              {questions.map((q, i) => (
                <li
                  key={`${q.spanish}-${q.context}`}
                  className="flex items-center justify-between gap-4 bg-zinc-800 rounded-xl px-4 py-3"
                >
                  <span className="flex items-center gap-2 text-zinc-200 text-sm">
                    {results[i]?.correct ? (
                      <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle size={16} className="text-red-400 shrink-0" />
                    )}
                    {q.spanish}
                    {q.context && <span className="text-zinc-500">({q.context})</span>}
                  </span>
                  <span className="text-cyan-300 text-sm font-semibold shrink-0">{q.answer}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={handleComplete}
              disabled={saving}
              className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 text-black font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2"
            >
              Completar misión
              <ArrowRight size={18} />
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
