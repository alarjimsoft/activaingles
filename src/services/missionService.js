/**  esto es lo que tenia antes
export async function getMissions(idCurso) {
  const response = await fetch(
    `https://gb572ef1f8a56c6-caa23.adb.us-ashburn-1.oraclecloudapps.com/ords/api/missions/course/${idCurso}`,
  );

  if (!response.ok) {
    throw new Error("Error loading missions");
  }

  return response.json();
} */
export async function getMissions(idCurso) {
  const response = await fetch(
    `https://gb572ef1f8a56c6-caa23.adb.us-ashburn-1.oraclecloudapps.com/ords/api/missions/course/${idCurso}`,
  );

  if (!response.ok) {
    throw new Error("Error loading missions");
  }

  const data = await response.json();

  console.log("MISSIONS RESPONSE:", data);

  return data.map((mission) => ({
    id: mission.mission_id,

    title: mission.title,

    description: mission.description,

    level: mission.level_code,

    duration: `${mission.duration_minutes} min`,

    status: mission.status || "ACTIVE",
  }));
}
