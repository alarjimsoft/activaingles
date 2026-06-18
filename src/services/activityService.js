const FASTAPI    = "http://127.0.0.1:8000";
const ORACLE_BASE = "https://gb572ef1f8a56c6-caa23.adb.us-ashburn-1.oraclecloudapps.com/ords/api";

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
  score,
  studentAnswer,
  correctAnswer,
}) {
  try {
    await fetch(`${ORACLE_BASE}/activities/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_inscripcion: idInscripcion,
        mission_id: missionId,
        activity_type: activityType,
        score,
        student_answer: studentAnswer,
        correct_answer: correctAnswer,
      }),
    });
  } catch { /* persistence es opcional */ }
}
