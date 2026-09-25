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
