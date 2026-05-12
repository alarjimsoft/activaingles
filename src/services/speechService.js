export async function speechToText(audioBlob) {
  const formData = new FormData();

  formData.append("audio", audioBlob, "recording.webm");

  const response = await fetch("http://127.0.0.1:8000/speech/to-text", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Speech-to-text failed");
  }

  return response.json();
}
