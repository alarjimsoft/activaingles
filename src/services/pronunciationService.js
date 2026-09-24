import { API_URL } from "../config/api";

export async function evaluatePronunciation(
  audioBlob,

  referenceText,
) {
  const formData = new FormData();

  formData.append("audio", audioBlob, "speech.wav");

  formData.append("reference_text", referenceText);

  const response = await fetch(
    `${API_URL}/speech/pronunciation-score`,

    {
      method: "POST",

      body: formData,
    },
  );

  return response.json();
}
