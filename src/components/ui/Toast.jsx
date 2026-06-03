import { motion } from "framer-motion";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";
import useNotificationStore from "../../store/useNotificationStore";

const VARIANTS = {
  success: {
    border: "border-cyan-500",
    icon: CheckCircle,
    iconColor: "text-cyan-400",
  },
  error: {
    border: "border-red-500",
    icon: XCircle,
    iconColor: "text-red-400",
  },
  warning: {
    border: "border-yellow-500",
    icon: AlertTriangle,
    iconColor: "text-yellow-400",
  },
  info: {
    border: "border-blue-500",
    icon: Info,
    iconColor: "text-blue-400",
  },
};

export default function Toast({ id, type, title, message }) {
  const removeNotification = useNotificationStore(
    (state) => state.removeNotification,
  );

  const { border, icon: Icon, iconColor } = VARIANTS[type] ?? VARIANTS.info;

  return (
    <motion.div
      layout
      initial={{ x: 120, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 120, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={`
        flex items-start gap-3
        bg-zinc-900
        border-l-4 ${border}
        border border-zinc-800
        rounded-2xl
        shadow-xl
        p-4
        w-80
        pointer-events-auto
      `}
    >
      <Icon className={`${iconColor} mt-0.5 shrink-0`} size={20} />

      <div className="flex-1 min-w-0">
        {title && (
          <p className="text-white text-sm font-semibold leading-tight">
            {title}
          </p>
        )}
        {message && (
          <p className="text-zinc-400 text-xs mt-0.5 leading-snug">{message}</p>
        )}
      </div>

      <button
        onClick={() => removeNotification(id)}
        className="text-zinc-500 hover:text-zinc-300 transition shrink-0"
      >
        <X size={16} />
      </button>
    </motion.div>
  );
}
