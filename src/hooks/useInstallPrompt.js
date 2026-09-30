import { useEffect, useState } from "react";

// El navegador avisa una sola vez, al cargar, que la app se puede instalar.
// Se escucha a nivel de módulo para no perder ese aviso si el menú aún no existe.
let deferredPrompt = null;
const listeners = new Set();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    listeners.forEach((notify) => notify(e));
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((notify) => notify(null));
  });
}

export default function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(deferredPrompt);

  useEffect(() => {
    listeners.add(setPromptEvent);
    return () => listeners.delete(setPromptEvent);
  }, []);

  async function install() {
    if (!promptEvent) return;
    promptEvent.prompt();
    await promptEvent.userChoice;
    deferredPrompt = null;
    listeners.forEach((notify) => notify(null));
  }

  return { canInstall: !!promptEvent, install };
}
