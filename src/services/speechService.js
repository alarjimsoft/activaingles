import { API_URL } from "../config/api";

export async function speechToText(audioBlob) {
  const formData = new FormData();

  formData.append("audio", audioBlob, "recording.webm");

  const response = await fetch(`${API_URL}/speech/to-text`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Speech-to-text failed");
  }

  return response.json();
}

// Palabra deletreada: { transcript, letters } con las letras que realmente se dijeron
export async function spellingToText(audioBlob) {
  const formData = new FormData();

  formData.append("audio", audioBlob, "recording.webm");

  const response = await fetch(`${API_URL}/speech/spelling`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Spelling recognition failed");
  }

  return response.json();
}
