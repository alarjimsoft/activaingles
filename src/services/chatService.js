import { API_URL } from "../config/api";

export async function sendChatMessage(data) {
  const response = await fetch(
    `${API_URL}/chat/message`,

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
