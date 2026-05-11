import { Bot, Send, Mic } from "lucide-react";

import { useEffect, useRef, useState } from "react";

import { motion } from "framer-motion";

import MessageBubble from "./MessageBubble";

export default function TutorChat({ mission }) {
  const [messages, setMessages] = useState([
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
  ]);

  const [input, setInput] = useState("");

  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef(null);

  // Auto Scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, isTyping]);

  // Fake AI Responses
  const tutorReplies = [
    "Excellent answer! 👍",
    "Very good. Can you expand your sentence?",
    "Nice work! Now try using another example.",
    "Great pronunciation and grammar.",
    "Good job! Let’s continue.",
  ];

  const sendMessage = () => {
    if (!input.trim()) return;

    const userMessage = {
      id: Date.now(),
      sender: "user",
      text: input,
    };

    setMessages((prev) => [...prev, userMessage]);

    setInput("");

    // Typing simulation
    setIsTyping(true);

    setTimeout(() => {
      const randomReply =
        tutorReplies[Math.floor(Math.random() * tutorReplies.length)];

      const tutorMessage = {
        id: Date.now() + 1,
        sender: "tutor",
        text: randomReply,
      };

      setMessages((prev) => [...prev, tutorMessage]);

      setIsTyping(false);
    }, 1500);
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
            className="
              bg-zinc-800
              hover:bg-zinc-700
              p-4
              rounded-2xl
              transition-all
            "
          >
            <Mic className="text-zinc-300" />
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
