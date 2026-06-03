import { AnimatePresence } from "framer-motion";
import useNotificationStore from "../../store/useNotificationStore";
import Toast from "./Toast";

export default function ToastContainer() {
  const notifications = useNotificationStore((state) => state.notifications);

  return (
    <div
      className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence initial={false}>
        {notifications.map((n) => (
          <Toast
            key={n.id}
            id={n.id}
            type={n.type}
            title={n.title}
            message={n.message}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
