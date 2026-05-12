export async function sendChatMessage(mission, message) {
  const response = await fetch("http://127.0.0.1:8000/chat/message", {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      mission,
      message,
    }),
  });

  if (!response.ok) {
    throw new Error("Chat failed");
  }

  return response.json();
}
