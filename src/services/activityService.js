import { API_URL, ORACLE_URL } from "../config/api";

const FASTAPI    = API_URL;
const ORACLE_BASE = ORACLE_URL;

export async function generateActivities(missionContent, missionId, levelCode = "A1") {
  const res = await fetch(`${FASTAPI}/activities/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mission_id: missionId,
      vocabulary: missionContent.vocabulary ?? [],
      grammar: missionContent.grammar ?? null,
      level_code: levelCode,
      activity_count: 4,
    }),
  });
  if (!res.ok) throw new Error("Activity generation failed");
  const data = await res.json();
  return data.activities;
}

export async function evaluateAnswer({ activityType, prompt, correctAnswer, studentAnswer }) {
  const res = await fetch(`${FASTAPI}/activities/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      activity_type: activityType,
      prompt,
      correct_answer: correctAnswer,
      student_answer: studentAnswer,
    }),
  });
  if (!res.ok) throw new Error("Evaluation failed");
  return res.json();
}

// P3-10: persistencia de resultados — fire and forget, no bloquea la UX
export async function saveActivityResult({
  idInscripcion,
  missionId,
  activityType,
  activityPrompt,
  score,
  studentAnswer,
  correctAnswer,
  isCorrect,
  aiExplanation,
}) {
  try {
    await fetch(`${ORACLE_BASE}/activities/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_inscripcion:  idInscripcion,
        mission_id:      missionId,
        activity_type:   activityType,
        activity_prompt: activityPrompt ?? null,
        correct_answer:  correctAnswer,
        student_answer:  studentAnswer,
        is_correct:      isCorrect ? "Y" : "N",
        score,
        ai_explanation:  aiExplanation ?? null,
      }),
    });
  } catch { /* persistence es opcional */ }
}
