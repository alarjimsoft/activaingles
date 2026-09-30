import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff } from "lucide-react";

// La app necesita internet para todo (Oracle y tutor IA): se avisa en lugar de fallar en silencio
export default function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline  = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="fixed top-0 inset-x-0 z-60 flex items-center justify-center gap-2 bg-amber-500 text-black text-sm font-medium px-4 py-2"
        >
          <WifiOff size={16} className="shrink-0" />
          Sin conexión a internet
        </motion.div>
      )}
    </AnimatePresence>
  );
}
