import axios from "axios";
import { ORACLE_URL } from "../config/api";

const API = `${ORACLE_URL}/progress`;

export async function getDashboardStats(idInscripcion) {
  const response = await axios.get(`${API}/stats/${idInscripcion}`);

  return response.data;
}
