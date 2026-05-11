import { Bot, Send, Mic } from "lucide-react";

export default function TutorChat() {
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

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Tutor Message */}
        <div className="flex justify-start">
          <div
            className="
              max-w-xl
              bg-zinc-800
              rounded-3xl
              rounded-tl-sm
              p-5
            "
          >
            <p className="text-zinc-200 leading-relaxed">
              Hello Luis Angel 👋
              <br />
              <br />
              Today we will practice how to introduce yourself in English.
              <br />
              <br />
              Tell me:
              <br />
              What is your name and profession?
            </p>
          </div>
        </div>

        {/* User Message */}
        <div className="flex justify-end">
          <div
            className="
              max-w-xl
              bg-cyan-500
              rounded-3xl
              rounded-tr-sm
              p-5
            "
          >
            <p className="text-black leading-relaxed">
              My name is Luis and I am a software developer.
            </p>
          </div>
        </div>
      </div>

      {/* Input Area */}
      <div
        className="
          border-t border-zinc-800
          p-5
        "
      >
        <div className="flex items-center gap-4">
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

          <input
            type="text"
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

          <button
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
