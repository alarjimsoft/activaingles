export async function evaluatePronunciation(
  audioBlob,

  referenceText,
) {
  const formData = new FormData();

  formData.append("audio", audioBlob, "speech.wav");

  formData.append("reference_text", referenceText);

  const response = await fetch(
    "http://127.0.0.1:8000/speech/pronunciation-score",

    {
      method: "POST",

      body: formData,
    },
  );

  return response.json();
}
