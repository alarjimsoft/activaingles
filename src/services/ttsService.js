import { API_URL } from "../config/api";

export async function speakText(text) {
  const response = await fetch(`${API_URL}/tts/speak`, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      text,
    }),
  });

  if (!response.ok) {
    throw new Error("TTS failed");
  }

  return response.blob();
}

// Audio del avatar con el inicio de cada palabra (ms) para mover los labios.
// language: "en" (frases en inglés) o "es" (instrucciones). Devuelve { audio (base64 MP3), words, wtimes }
export async function speakTextTimed(text, language = "en") {
  const response = await fetch(`${API_URL}/tts/speak-timed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language }),
  });

  if (!response.ok) {
    throw new Error("TTS failed");
  }

  return response.json();
}

// Versión que maneja el ciclo completo: fetch → play → revoke
export async function playText(text) {
  const blob = await speakText(text);
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  audio.play();
}
