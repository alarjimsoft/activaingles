import { Bot, Send, Mic } from "lucide-react";

import { useEffect, useRef, useState } from "react";

import { motion } from "framer-motion";

import MessageBubble from "./MessageBubble";

import useAppStore from "../../store/useAppStore";

import { speechToText } from "../../services/speechService";
import { speakText } from "../../services/ttsService";
import { sendChatMessage } from "../../services/chatService";

import CorrectionCard from "./CorrectionCard";

import { grammarForAI } from "../../utils/grammarRules";

import {
  startConversation,
  saveMessage,
  getHistory,
} from "../../services/conversationService";

import useAuthStore from "../../store/authStore";

import {
  updateProgress,
  getMissionProgress,
} from "../../services/progressService";

import { exportConversationPdf } from "../../utils/conversationPdf";

import { evaluatePronunciation } from "../../services/pronunciationService";

import useNotificationStore from "../../store/useNotificationStore";

// Stable empty array — prevents new [] reference on every render in Zustand selector
const EMPTY_MESSAGES = [];

export default function TutorChat({
  mission,
  setProgress,
  missionContent  = null,
  practiceScore   = null,
  baseProgress    = 0,
  onComplete      = null,
}) {
  const learningContext = missionContent ? {
    vocabulary:    missionContent.vocabulary ?? [],
    grammar:       grammarForAI(missionContent.grammarRules),
    examples:      missionContent.examples   ?? [],
    practice_score: practiceScore,
  } : null;
  const messages = useAppStore(
    (state) => state.conversations[mission.id] ?? EMPTY_MESSAGES,
  );

  const addMessage = useAppStore((state) => state.addMessage);

  const setConversation = useAppStore((state) => state.setConversation);

  const inscripcion = useAuthStore((state) => state.inscripcion);

  const student = useAuthStore((state) => state.student);

  const [input, setInput] = useState("");

  const [isTyping, setIsTyping] = useState(false);

  const [isListening, setIsListening] = useState(false);

  const [correction, setCorrection] = useState(null);

  const [conversationId, setConversationId] = useState(null);

  const [pronunciationResult, setPronunciationResult] = useState(null);

  const messagesEndRef = useRef(null);

  const mediaRecorderRef = useRef(null);
  const activeStreamRef  = useRef(null);

  const audioChunksRef = useRef([]);

  const sessionStartRef = useRef(null);

  const previousTimeRef = useRef(0);

  const conversationHistoryRef = useRef([]);

  const [conversationComplete, setConversationComplete] = useState(false);

  const addNotification = useNotificationStore((state) => state.addNotification);

  // Stable primitives — prevent object reference instability in useEffect deps
  const missionId = mission?.id;
  const missionTitle = mission?.title;
  const missionDescription = mission?.description;

  /*
    Session timer — initialized once on mount to avoid impure call in render
  */
  useEffect(() => {
    sessionStartRef.current = Date.now();
  }, []);

  /*
    Auto Scroll
  */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, isTyping]);

  /*
    Init conversation
  */
  useEffect(() => {
    async function initConversation() {
      try {
        const result = await startConversation({
          idInscripcion: inscripcion.idInscripcion,

          missionId,
        });

        setConversationId(result.conversationId);

        console.log("Conversation created:", result.conversationId);
      } catch (error) {
        console.error(error);
      }
    }

    if (inscripcion && missionId) {
      initConversation();
    }
  }, [inscripcion, missionId]);

  /*
    Load progress
  */
  useEffect(() => {
    async function loadProgress() {
      try {
        if (!inscripcion || !missionId) return;

        const data = await getMissionProgress(
          inscripcion.idInscripcion,

          missionId,
        );

        setProgress(data.progress_percent || 0);

        previousTimeRef.current = data.total_time_minutes || 0;

        console.log("Loaded progress:", data);
      } catch (error) {
        console.error(error);
      }
    }

    loadProgress();
  }, [inscripcion, missionId, setProgress]);

  /*
    Load history
  */
  useEffect(() => {
    async function loadHistory() {
      if (!conversationId) return;

      try {
        const history = await getHistory(conversationId);

        if (history.length === 0) {
          setConversation(missionId, [
            {
              id: `welcome-${missionId}`,
              sender: "tutor",
              text: `Hello! 👋\n\nToday we'll practice: ${missionTitle}\n\n${missionDescription}\n\nLet's get started! 😊`,
            },
          ]);
        } else {
          setConversation(
            missionId,
            history.map((msg) => ({
              id: msg.message_id,
              sender: msg.sender,
              text: msg.message_text,
            })),
          );
        }

        conversationHistoryRef.current = history.map((msg) => ({
          sender: msg.sender,
          text: msg.message_text,
        }));
      } catch (error) {
        console.error(error);
      }
    }

    loadHistory();
  }, [conversationId, setConversation, missionId, missionTitle, missionDescription]);

  // Cierra el stream de micrófono si el componente se desmonta durante una grabación
  useEffect(() => {
    return () => {
      activeStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  /*
    Speech recognition
  */
  const startListening = async () => {
    setPronunciationResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      activeStreamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        activeStreamRef.current = null;

        const audioBlob = new Blob(
          audioChunksRef.current,

          {
            type: "audio/webm",
          },
        );

        try {
          /*
            Speech To Text
          */
          const result = await speechToText(audioBlob);

          /*
            Transcript
          */
          const transcript = result.transcript;

          /*
            Pronunciation Assessment
          */
          const pronunciationData = await evaluatePronunciation(
            audioBlob,

            transcript,
          );

          setPronunciationResult(pronunciationData);

          /*
            Update input
          */
          setInput(transcript);

          /*
            Send message
          */
          sendTranscriptMessage(transcript);

          setInput("");
        } catch (error) {
          console.error(error);

          addNotification({
            type: "error",
            title: "Voice Recognition Failed",
            message: "Could not process your audio. Please try again.",
          });
        }

        setIsListening(false);
      };

      mediaRecorder.start();

      setIsListening(true);

      /*
        Stop after 4 seconds
      */
      setTimeout(() => {
        mediaRecorder.stop();
      }, 4000);
    } catch (error) {
      console.error(error);

      setIsListening(false);
    }
  };

  /*
    Play tutor voice
  */
  const playTutorVoice = async (text) => {
    try {
      const audioBlob = await speakText(text);

      const audioUrl = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);

      audio.onended = () => URL.revokeObjectURL(audioUrl);

      audio.play();
    } catch (error) {
      console.error(error);
    }
  };

  /*
    Send transcript message
  */
  const sendTranscriptMessage = async (transcript) => {
    if (!transcript.trim()) return;

    const userMessage = {
      id: Date.now(),

      sender: "user",

      text: transcript,
    };

    addMessage(mission.id, userMessage);

    if (conversationId) {
      await saveMessage({
        conversationId,

        sender: "student",

        messageText: transcript,
      });
    }

    setIsTyping(true);
    const totalMessages = messages.length + 1;
    const conversationCap = baseProgress + 40;
    const progressPercent = Math.min(baseProgress + totalMessages * 8, conversationCap);

    const xpEarned = totalMessages * 5;

    try {
      const result = await sendChatMessage({
        id_inscripcion: inscripcion.idInscripcion,

        mission_id: mission.id,

        mission,

        message: transcript,

        progress_percent: progressPercent,

        history: conversationHistoryRef.current.slice(-10),

        learning_context: learningContext,
      });

      setCorrection(result.correction);

      const tutorMessage = {
        id: Date.now() + 1,

        sender: "tutor",

        text: result.reply,
      };

      addMessage(mission.id, tutorMessage);

      if (conversationId) {
        await saveMessage({
          conversationId,

          sender: "tutor",

          messageText: tutorMessage.text,

          correction: result.correction,
        });
      }

      conversationHistoryRef.current.push(
        { sender: "student", text: transcript },
        { sender: "tutor", text: result.reply },
      );

      setProgress(progressPercent);

      const justConversationComplete = progressPercent >= conversationCap && !conversationComplete;
      if (justConversationComplete) {
        setConversationComplete(true);
        addNotification({
          type: "success",
          title: "¡Conversación completada!",
          message: "Ahora evalúa tu pronunciación para terminar la misión.",
          duration: 6000,
        });
      }

      /*
        UPDATE PROGRESS
      */
      const sessionElapsedMinutes = Math.round(
        (Date.now() - (sessionStartRef.current || Date.now())) / 60000,
      );

      await updateProgress({
        idInscripcion: inscripcion.idInscripcion,

        missionId: mission.id,

        progressPercent,

        isCompleted: false,

        totalXpEarned: xpEarned,

        totalMessages: messages.length + 1,

        totalTimeMinutes:
          previousTimeRef.current +
          Math.min(180, Math.max(1, sessionElapsedMinutes)),

        grammarScore: result.grammar_score ?? 90,
      });

      console.log(tutorMessage);

      playTutorVoice(tutorMessage.text);
    } catch (error) {
      console.error(error);
    } finally {
      setIsTyping(false);
    }
  };

  /*
    Send text message
  */
  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = {
      id: Date.now(),

      sender: "user",

      text: input,
    };

    addMessage(mission.id, userMessage);

    if (conversationId) {
      await saveMessage({
        conversationId,

        sender: "student",

        messageText: input,
      });
    }

    setInput("");

    const totalMessages = messages.length + 1;
    const conversationCap = baseProgress + 40;
    const progressPercent = Math.min(baseProgress + totalMessages * 8, conversationCap);

    const xpEarned = totalMessages * 5;

    setIsTyping(true);

    try {
      const result = await sendChatMessage({
        id_inscripcion: inscripcion.idInscripcion,

        mission_id: mission.id,

        mission,

        message: input,

        progress_percent: progressPercent,

        history: conversationHistoryRef.current.slice(-10),

        learning_context: learningContext,
      });

      setCorrection(result.correction);

      const tutorMessage = {
        id: Date.now() + 1,

        sender: "tutor",

        text: result.reply,
      };

      addMessage(mission.id, tutorMessage);

      if (conversationId) {
        await saveMessage({
          conversationId,

          sender: "tutor",

          messageText: tutorMessage.text,

          correction: result.correction,
        });
      }

      conversationHistoryRef.current.push(
        { sender: "student", text: input },
        { sender: "tutor", text: result.reply },
      );

      setProgress(progressPercent);

      const justConversationComplete = progressPercent >= conversationCap && !conversationComplete;
      if (justConversationComplete) {
        setConversationComplete(true);
        addNotification({
          type: "success",
          title: "¡Conversación completada!",
          message: "Ahora evalúa tu pronunciación para terminar la misión.",
          duration: 6000,
        });
      }

      /*
        UPDATE PROGRESS
      */
      const sessionElapsedMinutes = Math.round(
        (Date.now() - (sessionStartRef.current || Date.now())) / 60000,
      );

      await updateProgress({
        idInscripcion: inscripcion.idInscripcion,

        missionId: mission.id,

        progressPercent,

        isCompleted: false,

        totalXpEarned: xpEarned,

        totalMessages: messages.length + 1,

        totalTimeMinutes:
          previousTimeRef.current +
          Math.min(180, Math.max(1, sessionElapsedMinutes)),

        grammarScore: result.grammar_score ?? 90,
      });

      playTutorVoice(tutorMessage.text);
    } catch (error) {
      console.error(error);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div
      className="
        bg-zinc-900/70
        backdrop-blur-xl
        border border-zinc-800
        rounded-3xl
        flex flex-col
        h-[calc(100dvh-6rem)] min-h-120 lg:h-200
      "
    >
      {/* Header */}
      <div
        className="
          border-b border-zinc-800
          p-4 sm:p-6
        "
      >
        <div className="flex items-start gap-4">
          <div className="bg-cyan-500 p-3 rounded-2xl">
            <Bot className="text-black" />
          </div>

          <div className="flex-1">
            <h2 className="text-white text-xl font-bold">AI Tutor</h2>

            <p className="text-zinc-400 text-sm mb-4">
              {missionContent?.grammarRules?.length > 0
                ? `Today's focus: ${missionContent.grammarRules.map((r) => r.title).filter(Boolean).join(" · ")}`
                : "Mission active"}
            </p>

            <button
              onClick={() =>
                exportConversationPdf(
                  mission,

                  messages,

                  student,
                )
              }
              className="
                bg-cyan-500
                hover:bg-cyan-400
                text-black
                px-4
                py-2
                rounded-xl
                text-sm
                font-semibold
                transition
              "
            >
              Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            sender={message.sender}
            text={message.text}
          />
        ))}

        {/* Typing */}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div
              className="
                bg-zinc-800
                rounded-3xl
                rounded-tl-sm
                px-5 py-4
                flex items-center gap-2
              "
            >
              <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce"></div>

              <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce delay-100"></div>

              <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce delay-200"></div>
            </div>
          </motion.div>
        )}

        <CorrectionCard correction={correction} />

        <div ref={messagesEndRef}></div>
      </div>

      {/* Pronunciación del mensaje de voz: un solo puntaje */}
      {pronunciationResult && (
        <div className="mx-4 mb-4 bg-zinc-900 border border-cyan-500/30 rounded-2xl px-4 py-3 flex items-center gap-3">
          <Mic size={16} className="text-cyan-400 shrink-0" />
          <p className="text-sm text-zinc-300">
            Pronunciación:{" "}
            <span className="text-cyan-400 font-semibold">
              {Math.round(pronunciationResult.pronunciation_score)} / 100
            </span>
            <span className="text-zinc-400">
              {" · "}
              {pronunciationResult.pronunciation_score >= 80
                ? "¡Muy bien!"
                : pronunciationResult.pronunciation_score >= 60
                ? "Bien, sigue practicando."
                : "Inténtalo más despacio."}
            </span>
          </p>
        </div>
      )}

      {/* Conversación completa — última fase antes de terminar la misión */}
      {conversationComplete && onComplete && (
        <div className="px-5 pb-2">
          <button
            onClick={onComplete}
            className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-3 rounded-2xl transition-colors"
          >
            Completar Misión →
          </button>
        </div>
      )}

      {/* Input */}
      <div
        className="
          border-t border-zinc-800
          p-3 sm:p-5
        "
      >
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Mic */}
          <button
            onClick={startListening}
            className={`
              p-3 sm:p-4
              shrink-0
              rounded-2xl
              transition-all

              ${
                isListening
                  ? "bg-red-500 animate-pulse"
                  : "bg-zinc-800 hover:bg-zinc-700"
              }
            `}
          >
            <Mic className={isListening ? "text-white" : "text-zinc-300"} />
          </button>

          {/* Input */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                sendMessage();
              }
            }}
            placeholder="Write your answer..."
            className="
              flex-1
              min-w-0
              bg-zinc-800
              border border-zinc-700
              rounded-2xl
              px-4 py-3 sm:px-5 sm:py-4
              text-white
              outline-none
              focus:border-cyan-500
            "
          />

          {/* Send */}
          <button
            onClick={sendMessage}
            className="
              bg-cyan-500
              hover:bg-cyan-400
              p-3 sm:p-4
              shrink-0
              rounded-2xl
              transition-all
            "
          >
            <Send className="text-black" />
          </button>
        </div>
      </div>
    </div>
  );
}
