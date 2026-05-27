export async function sendChatMessage(data) {
  const response = await fetch(
    "http://127.0.0.1:8000/chat/message",

    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(data),
    },
  );

  return response.json();
}
