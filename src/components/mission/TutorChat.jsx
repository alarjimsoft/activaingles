import { Bot, Send, Mic } from "lucide-react";

import { useEffect, useRef, useState } from "react";

import { motion } from "framer-motion";

import MessageBubble from "./MessageBubble";

import useAppStore from "../../store/useAppStore";

import { speechToText } from "../../services/speechService";
import { speakText } from "../../services/ttsService";
import { sendChatMessage } from "../../services/chatService";

export default function TutorChat({ mission }) {
  const messages = useAppStore((state) => state.getConversation(mission.id));

  const addMessage = useAppStore((state) => state.addMessage);
  /* const [messages, setMessages] = useState([
    {
      id: 1,
      sender: "tutor",
      text: `
Hello 👋

Today we will practice:

${mission.title}

Tell me something about yourself.
      `,
    },
  ]); */

  const [input, setInput] = useState("");

  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Auto Scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, isTyping]);

  const startListening = async () => {
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
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });

        try {
          const result = await speechToText(audioBlob);

          setInput(result.transcript);
          sendTranscriptMessage(result.transcript);
          setInput("");
        } catch (error) {
          console.error(error);

          alert("Speech recognition failed.");
        }

        setIsListening(false);
      };

      mediaRecorder.start();

      setIsListening(true);

      // Stop after 4 seconds
      setTimeout(() => {
        mediaRecorder.stop();
      }, 4000);
    } catch (error) {
      console.error(error);

      setIsListening(false);
    }
  };

  const playTutorVoice = async (text) => {
    try {
      const audioBlob = await speakText(text);

      const audioUrl = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);

      audio.play();
    } catch (error) {
      console.error(error);
    }
  };

  const sendTranscriptMessage = async (transcript) => {
    if (!transcript.trim()) return;

    const userMessage = {
      id: Date.now(),
      sender: "user",
      text: transcript,
    };

    addMessage(mission.id, userMessage);

    setIsTyping(true);

    try {
      const result = await sendChatMessage(mission, transcript);

      const tutorMessage = {
        id: Date.now() + 1,
        sender: "tutor",
        text: result.response,
      };

      addMessage(mission.id, tutorMessage);

      playTutorVoice(tutorMessage.text);
    } catch (error) {
      console.error(error);
    } finally {
      setIsTyping(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = {
      id: Date.now(),
      sender: "user",
      text: input,
    };

    //setMessages((prev) => [...prev, userMessage]);
    addMessage(mission.id, userMessage);

    setInput("");

    // Typing simulation
    setIsTyping(true);

    try {
      const result = await sendChatMessage(mission, input);

      const tutorMessage = {
        id: Date.now() + 1,
        sender: "tutor",
        text: result.response,
      };

      addMessage(mission.id, tutorMessage);

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
          flex items-center gap-4
        "
      >
        <div className="bg-cyan-500 p-3 rounded-2xl">
          <Bot className="text-black" />
        </div>

        <div>
          <h2 className="text-white text-xl font-bold">AI Tutor</h2>

          <p className="text-zinc-400 text-sm">Mission active</p>
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

        {/* Typing Indicator */}
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

        <div ref={messagesEndRef}></div>
      </div>

      {/* Input */}
      <div
        className="
          border-t border-zinc-800
          p-5
        "
      >
        <div className="flex items-center gap-4">
          {/* Mic Button */}
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
