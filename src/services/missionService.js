import { ORACLE_URL } from "../config/api";

export async function getMissions(idCurso, idInscripcion) {
  const response = await fetch(
    `${ORACLE_URL}/missions/course/${idCurso}/${idInscripcion}`,
  );

  if (!response.ok) {
    throw new Error("Error loading missions");
  }

  const data = await response.json();

  console.log("FIRST MISSION FULL:", JSON.stringify(data[0], null, 2));

  return data.map((mission) => ({
    id: mission.missionId,
    missionId: mission.missionId,
    title: mission.title,
    description: mission.description,
    level: mission.levelCode,
    duration: `${mission.durationMinutes} min`,
    durationMinutes: mission.durationMinutes,
    status: mission.status || "ACTIVE",
    grammarTitle: mission.grammarTitle,
    grammarExample: mission.grammarExample,
    sortOrder: mission.sortOrder,
    topicId: mission.topicId,
    topicTitle: mission.topicTitle,
    topicSortOrder: mission.topicSortOrder,
  }));
}
