export async function getMissions(idCurso) {
  const response = await fetch(
    `https://gb572ef1f8a56c6-caa23.adb.us-ashburn-1.oraclecloudapps.com/ords/api/missions/course/${idCurso}`,
  );

  if (!response.ok) {
    throw new Error("Error loading missions");
  }

  return response.json();
}
