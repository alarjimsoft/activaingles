import { API_URL, ORACLE_URL } from "../config/api";

const ORACLE_BASE = ORACLE_URL;

export async function loginStudent(matricula, password) {
  const response = await fetch(`${ORACLE_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `x01=${matricula}&x02=${password}`,
  });

  if (!response.ok) {
    throw new Error("Login failed");
  }

  return response.json();
}

// FastAPI valida contra Oracle y además entrega el token para las rutas de quizzes.
// Responde { success, message, academico, token, expiresAt }.
export async function loginAcademico(idAcademico, password) {
  const response = await fetch(`${API_URL}/auth/academico`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idAcademico, password }),
  });

  if (response.status === 401) {
    const body = await response.json().catch(() => ({}));
    return { success: false, message: body.detail?.message };
  }

  if (!response.ok) {
    throw new Error("Login failed");
  }

  return response.json();
}
