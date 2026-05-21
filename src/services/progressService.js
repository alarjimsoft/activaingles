import axios from "axios";

const API =
  "https://gb572ef1f8a56c6-caa23.adb.us-ashburn-1.oraclecloudapps.com/ords/api/progress";

export async function startProgress({
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

export async function updateProgress({
  idInscripcion,

  missionId,

  progressPercent,

  totalXpEarned,

  totalMessages,

  totalTimeMinutes,

  grammarScore,

  pronunciationScore,
}) {
  const response = await axios.post(
    `${API}/update`,

    {
      id_inscripcion: idInscripcion,

      mission_id: missionId,

      progress_percent: progressPercent,

      total_xp_earned: totalXpEarned,

      total_messages: totalMessages,

      total_time_minutes: totalTimeMinutes,

      grammar_score: grammarScore,

      pronunciation_score: pronunciationScore,
    },
  );

  return response.data;
}

export async function completeMission({
  idInscripcion,

  missionId,
}) {
  const response = await axios.post(
    `${API}/complete`,

    {
      id_inscripcion: idInscripcion,

      mission_id: missionId,
    },
  );

  return response.data;
}

export async function getMissionProgress(idInscripcion, missionId) {
  const response = await fetch(
    `http://localhost:8080/ords/admin/progress/mission/${idInscripcion}/${missionId}`,
  );

  return await response.json();
}
