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
