import axios from "axios";

const API =
  "https://gb572ef1f8a56c6-caa23.adb.us-ashburn-1.oraclecloudapps.com/ords/api/progress";

export async function getDashboardStats(idInscripcion) {
  const response = await axios.get(`${API}/stats/${idInscripcion}`);

  return response.data;
}
