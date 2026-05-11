import { motion } from "framer-motion";

export default function MessageBubble({ sender, text }) {
  const isTutor = sender === "tutor";

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`
        flex
        ${isTutor ? "justify-start" : "justify-end"}
      `}
    >
      <div
        className={`
          max-w-xl
          p-5
          rounded-3xl
          leading-relaxed

          ${
            isTutor
              ? "bg-zinc-800 text-zinc-200 rounded-tl-sm"
              : "bg-cyan-500 text-black rounded-tr-sm"
          }
        `}
      >
        {text}
      </div>
    </motion.div>
  );
}
