import axios from "axios";

const API =
  "https://gb572ef1f8a56c6-caa23.adb.us-ashburn-1.oraclecloudapps.com/ords/api/chat";

export async function startConversation({
  idInscripcion,

  missionId,
}) {
  const response = await axios.post(
    `${API}/start`,

    {
      id_inscripcion: idInscripcion,

      mission_id: missionId,
    },
  );

  return response.data;
}

export async function saveMessage({
  conversationId,

  sender,

  messageText,
}) {
  const response = await axios.post(
    `${API}/message`,

    {
      conversation_id: conversationId,

      sender,

      message_text: messageText,
    },
  );

  return response.data;
}

export async function getHistory(conversationId) {
  const response = await axios.get(`${API}/history/${conversationId}`);

  return response.data.items;
}
