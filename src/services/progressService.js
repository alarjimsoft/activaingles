import axios from "axios";
import { ORACLE_URL } from "../config/api";
import { computeMissionXp } from "../utils/missionXp";

const API = `${ORACLE_URL}/progress`;

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
  const payload = { id_inscripcion: idInscripcion, mission_id: missionId };

  if (progressPercent  !== undefined) payload.progress_percent    = progressPercent;
  if (totalXpEarned    !== undefined) payload.total_xp_earned     = totalXpEarned;
  if (totalMessages    !== undefined) payload.total_messages       = totalMessages;
  if (totalTimeMinutes !== undefined) payload.total_time_minutes   = totalTimeMinutes;
  if (grammarScore     !== undefined) payload.grammar_score        = grammarScore;
  if (pronunciationScore != null)     payload.pronunciation_score  = pronunciationScore;

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
    `${ORACLE_URL}/progress/mission/${idInscripcion}/${missionId}`,
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

export async function getPhaseStatus(idInscripcion, missionId) {
  try {
    const response = await fetch(`${API}/phase/${idInscripcion}/${missionId}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.items?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function updatePhase({
  idInscripcion,
  missionId,
  currentPhase,
  learningCompleted,
  practiceCompleted,
  practiceScore,
  assessmentCompleted,
}) {
  const payload = {
    id_inscripcion: idInscripcion,
    mission_id: missionId,
    current_phase: currentPhase,
  };
  if (learningCompleted !== undefined) payload.learning_completed = learningCompleted;
  if (practiceCompleted !== undefined) payload.practice_completed = practiceCompleted;
  if (practiceScore !== undefined) payload.practice_score = practiceScore;
  if (assessmentCompleted !== undefined) payload.assessment_completed = assessmentCompleted;

  const response = await axios.post(`${API}/phase`, payload);
  return response.data;
}

// Recalcula el XP de la misión con los puntajes guardados en Oracle y lo guarda.
// Oracle conserva el máximo (GREATEST), así que llamarla varias veces es seguro.
export async function awardMissionXp({ idInscripcion, missionId }) {
  const [phase, progress] = await Promise.all([
    getPhaseStatus(idInscripcion, missionId),
    getMissionProgress(idInscripcion, missionId).catch(() => null),
  ]);

  const completed =
    progress?.is_completed === "Y" || phase?.current_phase === "completion";

  const totalXpEarned = computeMissionXp(missionId, {
    learningDone: phase?.learning_completed === "Y",
    completed,
    scores: {
      practice:     phase?.practice_completed === "Y" ? phase.practice_score : null,
      assessment:   phase?.assessment_completed === "Y" ? progress?.pronunciation_score : null,
      // La gramática de la conversación cuenta cuando la conversación terminó (misión completada)
      conversation: completed ? progress?.grammar_score : null,
    },
  });

  await updateProgress({ idInscripcion, missionId, totalXpEarned });
  return totalXpEarned;
}
