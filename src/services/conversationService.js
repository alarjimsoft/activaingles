import axios from "axios";
import { ORACLE_URL } from "../config/api";

const API = `${ORACLE_URL}/chat`;

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

  correction = null,
}) {
  const response = await axios.post(
    `${API}/message`,

    {
      conversation_id: conversationId,

      sender,

      message_text: messageText,

      correction: correction ? JSON.stringify(correction) : null,
    },
  );

  return response.data;
}

export async function getHistory(conversationId) {
  const response = await axios.get(`${API}/history/${conversationId}`);

  return response.data.items;
}
