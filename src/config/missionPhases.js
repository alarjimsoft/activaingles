// Fases de cada misión, tipo de evaluación en la fase "assessment" y tipo de conversación.
// Las misiones no listadas usan el recorrido completo, la evaluación de pronunciación y el chat.

export const DEFAULT_PHASES = ["learning", "practice", "assessment", "conversation", "completion"];

// Peso de cada fase en el progreso; se reparte a 100 entre las fases que tenga la misión
const PHASE_WEIGHTS = { learning: 20, practice: 20, assessment: 20, conversation: 40 };

const MISSION_CONFIG = {
  1: { conversation: "avatar", practiceRules: ["greetings_only", "no_names"] },
  3: { phases: ["learning", "assessment", "completion"], assessment: "spelling" },
};

export function getMissionPhases(missionId) {
  return MISSION_CONFIG[missionId]?.phases ?? DEFAULT_PHASES;
}

// "pronunciation" (6 frases) o "spelling" (deletrear 6 palabras)
export function getAssessmentType(missionId) {
  return MISSION_CONFIG[missionId]?.assessment ?? "pronunciation";
}

// "chat" (tutor IA libre) o "avatar" (el avatar pide 6 frases del vocabulario)
export function getConversationType(missionId) {
  return MISSION_CONFIG[missionId]?.conversation ?? "chat";
}

// Reglas para los ejercicios de práctica (PRACTICE_RULES en activity_service.py):
// "greetings_only" (solo saludos y despedidas), "no_names" (sin nombres), "no_to_be" (sin verbo TO BE)
export function getPracticeRules(missionId) {
  return MISSION_CONFIG[missionId]?.practiceRules ?? [];
}

export function getPhaseWeights(phases) {
  const total = phases.reduce((sum, p) => sum + (PHASE_WEIGHTS[p] ?? 0), 0);
  return Object.fromEntries(
    phases.map((p) => [p, total > 0 ? ((PHASE_WEIGHTS[p] ?? 0) / total) * 100 : 0]),
  );
}

// Fase guardada en Oracle que esta misión no tiene (por ejemplo "practice" en la misión 3,
// o un avance hecho antes de este cambio): se lleva a la siguiente fase que sí tenga.
export function resolvePhase(phase, phases) {
  if (phases.includes(phase)) return phase;
  const order = DEFAULT_PHASES.indexOf(phase);
  return phases.find((p) => DEFAULT_PHASES.indexOf(p) > order) ?? phases[phases.length - 1];
}
