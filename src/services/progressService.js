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
  const payload = {
    id_inscripcion: idInscripcion,

    mission_id: missionId,

    progress_percent: progressPercent,

    total_xp_earned: totalXpEarned,

    total_messages: totalMessages,

    total_time_minutes: totalTimeMinutes,

    grammar_score: grammarScore,
  };

  if (pronunciationScore != null) {
    payload.pronunciation_score = pronunciationScore;
  }

  const response = await axios.post(`${API}/update`, payload);

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
    `https://gb572ef1f8a56c6-caa23.adb.us-ashburn-1.oraclecloudapps.com/ords/api/progress/mission/${idInscripcion}/${missionId}`,
  );

  return await response.json();
}

export async function getAllMissionsProgress(idInscripcion, missions) {
  const practicedMissions = missions.filter((m) => m.status !== "LOCKED");
  const results = await Promise.all(
    practicedMissions.map((m) =>
      getMissionProgress(idInscripcion, m.missionId).catch(() => null),
    ),
  );
  return practicedMissions.reduce((acc, m, i) => {
    acc[m.missionId] = results[i];
    return acc;
  }, {});
}
