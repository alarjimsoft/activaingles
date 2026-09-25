import { ORACLE_URL } from "../config/api";

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

export async function loginAcademico(idAcademico, password) {
  const response = await fetch(`${ORACLE_BASE}/auth/loginacademicos`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `x01=${idAcademico}&x02=${password}`,
  });

  if (!response.ok) {
    throw new Error("Login failed");
  }

  return response.json();
}
