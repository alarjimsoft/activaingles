import { getMissionPhases } from "../config/missionPhases";

// XP de una misión (máximo 200 = un nivel, porque el nivel sube cada 200 XP):
//   Aprendizaje completado ........ 10
//   Desempeño ..................... 150, repartidos entre las fases con puntaje
//                                   que tenga la misión (práctica, pronunciación/
//                                   deletreo, conversación): puntaje/100 × su parte
//   Misión completada ............. 40
// Se calcula siempre desde los puntajes guardados: repetir una fase no suma XP extra,
// y Oracle conserva el máximo (GREATEST), así que tampoco baja si se repite peor.

export const LEARNING_XP    = 10;
export const PERFORMANCE_XP = 150;
export const COMPLETION_XP  = 40;

const SCORED_PHASES = ["practice", "assessment", "conversation"];

function clampScore(score) {
  const n = Number(score);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : null;
}

// scores: { practice, assessment, conversation } (0-100, null si la fase no se ha hecho)
export function computeMissionXp(missionId, { learningDone = false, scores = {}, completed = false }) {
  const phases = getMissionPhases(missionId);
  const scored = SCORED_PHASES.filter((p) => phases.includes(p));
  const share  = scored.length > 0 ? PERFORMANCE_XP / scored.length : 0;

  let xp = learningDone ? LEARNING_XP : 0;
  for (const phase of scored) {
    const score = clampScore(scores[phase]);
    if (score !== null) xp += share * (score / 100);
  }
  if (completed) xp += COMPLETION_XP;

  return Math.round(xp);
}
