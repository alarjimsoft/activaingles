export async function getMissions(idCurso) {
  const response = await fetch(
    `https://gb572ef1f8a56c6-caa23.adb.us-ashburn-1.oraclecloudapps.com/ords/api/missions/course/${idCurso}`,
  );

  if (!response.ok) {
    throw new Error("Error loading missions");
  }

  const data = await response.json();

  console.log("FIRST MISSION FULL:", JSON.stringify(data[0], null, 2));

  return data.map((mission) => ({
    id: mission.missionId,

    title: mission.title,

    description: mission.description,

    level: mission.levelCode,

    duration: `${mission.durationMinutes} min`,

    status: mission.status || "ACTIVE",
  }));
}
