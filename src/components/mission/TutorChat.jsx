import { Bot, Send, Mic } from "lucide-react";

import { useEffect, useRef, useState } from "react";

import { motion } from "framer-motion";

import MessageBubble from "./MessageBubble";

import useAppStore from "../../store/useAppStore";

import { speechToText } from "../../services/speechService";
import { speakText } from "../../services/ttsService";
import { sendChatMessage } from "../../services/chatService";

import CorrectionCard from "./CorrectionCard";

import {
  startConversation,
  saveMessage,
  getHistory,
} from "../../services/conversationService";

import useAuthStore from "../../store/authStore";

import {
  startProgress,
  updateProgress,
  getMissionProgress,
} from "../../services/progressService";

import { exportConversationPdf } from "../../utils/conversationPdf";

import { evaluatePronunciation } from "../../services/pronunciationService";

export default function TutorChat({
  mission,

  setProgress,
}) {
  const messages = useAppStore((state) => state.getConversation(mission.id));

  const addMessage = useAppStore((state) => state.addMessage);

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

  const audioChunksRef = useRef([]);

  const [missionCompleted, setMissionCompleted] = useState(false);

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

          missionId: mission.id,
        });

        setConversationId(result.conversationId);

        /*
          START PROGRESS
        */
        await startProgress({
          idInscripcion: inscripcion.idInscripcion,

          missionId: mission.id,
        });

        console.log("Conversation created:", result.conversationId);
      } catch (error) {
        console.error(error);
      }
    }

    if (inscripcion && mission) {
      initConversation();
    }
  }, [inscripcion, mission]);

  /*
    Load progress
  */
  useEffect(() => {
    async function loadProgress() {
      try {
        if (!inscripcion || !mission) return;

        const data = await getMissionProgress(
          inscripcion.idInscripcion,

          mission.id,
        );

        setProgress(data.progress_percent || 0);
        if (data.is_completed === "Y") {
          setMissionCompleted(true);
        }

        console.log("Loaded progress:", data);
      } catch (error) {
        console.error(error);
      }
    }

    loadProgress();
  }, [inscripcion, mission]);

  /*
    Load history
  */
  useEffect(() => {
    async function loadHistory() {
      if (!conversationId) return;

      try {
        const history = await getHistory(conversationId);

        history.forEach((msg) => {
          addMessage(
            mission.id,

            {
              id: msg.message_id,

              sender: msg.sender,

              text: msg.message_text,
            },
          );
        });
      } catch (error) {
        console.error(error);
      }
    }

    loadHistory();
  }, [conversationId, addMessage, mission]);

  /*
    Speech recognition
  */
  const startListening = async () => {
    setPronunciationResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

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

          console.log(pronunciationData);

          setPronunciationResult(pronunciationData);

          /*
            Update input
          */
          setInput(transcript);

          /*
            Send message
          */
          sendTranscriptMessage(transcript, pronunciationData);

          setInput("");
        } catch (error) {
          console.error(error);

          alert("Speech recognition failed.");
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
  const sendTranscriptMessage = async (transcript, pronunciationData) => {
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

    const progressPercent = Math.min(totalMessages * 10, 100);

    const xpEarned = totalMessages * 5;

    try {
      const result = await sendChatMessage({
        id_inscripcion: inscripcion.idInscripcion,

        mission_id: mission.id,

        mission,

        message: transcript,

        progress_percent: progressPercent,
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
        });
      }

      setProgress(progressPercent);

      /*
        UPDATE PROGRESS
      */
      await updateProgress({
        idInscripcion: inscripcion.idInscripcion,

        missionId: mission.id,

        progressPercent,

        isCompleted: progressPercent >= 100,

        totalXpEarned: xpEarned,

        totalMessages: messages.length + 1,

        totalTimeMinutes: 5,

        grammarScore: result.grammar_score ?? 90,

        pronunciationScore: pronunciationData?.pronunciation_score || undefined,
      });
      if (progressPercent >= 100 && !missionCompleted) {
        alert("Mission Completed! 🎉");
        setMissionCompleted(true);
      }

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

    const progressPercent = Math.min(totalMessages * 10, 100);

    const xpEarned = totalMessages * 5;

    setIsTyping(true);

    try {
      const result = await sendChatMessage({
        id_inscripcion: inscripcion.idInscripcion,

        mission_id: mission.id,

        mission,

        message: input,

        progress_percent: progressPercent,
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
        });
      }

      setProgress(progressPercent);

      /*
        UPDATE PROGRESS
      */
      await updateProgress({
        idInscripcion: inscripcion.idInscripcion,

        missionId: mission.id,

        progressPercent,

        isCompleted: progressPercent >= 100,

        totalXpEarned: xpEarned,

        totalMessages: messages.length + 1,

        totalTimeMinutes: 5,

        grammarScore: result.grammar_score ?? 90,
      });
      if (progressPercent >= 100) {
        alert("Mission Completed! 🎉");
      }

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
        h-[800px]
      "
    >
      {/* Header */}
      <div
        className="
          border-b border-zinc-800
          p-6
        "
      >
        <div className="flex items-start gap-4">
          <div className="bg-cyan-500 p-3 rounded-2xl">
            <Bot className="text-black" />
          </div>

          <div className="flex-1">
            <h2 className="text-white text-xl font-bold">AI Tutor</h2>

            <p className="text-zinc-400 text-sm mb-4">Mission active</p>

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

      {/* Pronunciation Scores */}
      {pronunciationResult && (
        <div
          className="
              mx-4
              mb-4
              bg-zinc-900
              border border-cyan-500/30
              rounded-2xl
              p-4
            "
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-cyan-400 font-bold">
              Pronunciation Assessment
            </h3>

            <span
              className="
                  text-xs
                  bg-cyan-500/20
                  text-cyan-300
                  px-2
                  py-1
                  rounded-lg
                "
            >
              AI Speech Analysis
            </span>
          </div>

          <div className="space-y-3">
            {/* Pronunciation */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-zinc-300">Pronunciation</span>

                <span className="text-cyan-400 font-semibold">
                  {Math.round(pronunciationResult.pronunciation_score)}
                </span>
              </div>

              <div className="w-full bg-zinc-800 rounded-full h-2">
                <div
                  className="
                      bg-cyan-400
                      h-2
                      rounded-full
                    "
                  style={{
                    width: `${pronunciationResult.pronunciation_score}%`,
                  }}
                />
              </div>
            </div>

            {/* Accuracy */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-zinc-300">Accuracy</span>

                <span className="text-cyan-400 font-semibold">
                  {Math.round(pronunciationResult.accuracy_score)}
                </span>
              </div>

              <div className="w-full bg-zinc-800 rounded-full h-2">
                <div
                  className="
                      bg-green-400
                      h-2
                      rounded-full
                    "
                  style={{
                    width: `${pronunciationResult.accuracy_score}%`,
                  }}
                />
              </div>
            </div>

            {/* Fluency */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-zinc-300">Fluency</span>

                <span className="text-cyan-400 font-semibold">
                  {Math.round(pronunciationResult.fluency_score)}
                </span>
              </div>

              <div className="w-full bg-zinc-800 rounded-full h-2">
                <div
                  className="
                      bg-yellow-400
                      h-2
                      rounded-full
                    "
                  style={{
                    width: `${pronunciationResult.fluency_score}%`,
                  }}
                />
              </div>
            </div>

            {/* Completeness */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-zinc-300">Completeness</span>

                <span className="text-cyan-400 font-semibold">
                  {Math.round(pronunciationResult.completeness_score)}
                </span>
              </div>

              <div className="w-full bg-zinc-800 rounded-full h-2">
                <div
                  className="
                      bg-purple-400
                      h-2
                      rounded-full
                    "
                  style={{
                    width: `${pronunciationResult.completeness_score}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div
        className="
          border-t border-zinc-800
          p-5
        "
      >
        <div className="flex items-center gap-4">
          {/* Mic */}
          <button
            onClick={startListening}
            className={`
              p-4
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
              bg-zinc-800
              border border-zinc-700
              rounded-2xl
              px-5 py-4
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
              p-4
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
