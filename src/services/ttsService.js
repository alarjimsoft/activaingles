export async function speakText(text) {
  const response = await fetch("http://127.0.0.1:8000/tts/speak", {
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

// Versión que maneja el ciclo completo: fetch → play → revoke
export async function playText(text) {
  const blob = await speakText(text);
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  audio.play();
}
