// Fases de cada misión y tipo de evaluación en la fase "assessment".
// Las misiones no listadas usan el recorrido completo y la evaluación de pronunciación.

export const DEFAULT_PHASES = ["learning", "practice", "assessment", "conversation", "completion"];

// Peso de cada fase en el progreso; se reparte a 100 entre las fases que tenga la misión
const PHASE_WEIGHTS = { learning: 20, practice: 20, assessment: 20, conversation: 40 };

const MISSION_CONFIG = {
  3: { phases: ["learning", "assessment", "completion"], assessment: "spelling" },
};

export function getMissionPhases(missionId) {
  return MISSION_CONFIG[missionId]?.phases ?? DEFAULT_PHASES;
}

// "pronunciation" (6 frases) o "spelling" (deletrear 6 palabras)
export function getAssessmentType(missionId) {
  return MISSION_CONFIG[missionId]?.assessment ?? "pronunciation";
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
