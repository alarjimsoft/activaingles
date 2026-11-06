import { API_URL } from "../config/api";
import useAuthStore from "../store/authStore";
import useNotificationStore from "../store/useNotificationStore";

const BASE = `${API_URL}/quizzes`;

export const QUIZ_TEMPLATE_URL = "/quiz/Plantilla_Quiz_ActivaIngles.docx";
export const QUIZ_GUIDE_URL = "/quiz/Guia_Crear_Quiz.docx";

export class QuizApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sessionExpired() {
  useAuthStore.getState().logout();
  useNotificationStore.getState().addNotification({
    type: "warning",
    title: "Sesión expirada",
    message: "Vuelve a iniciar sesión para continuar.",
  });
}

async function request(path, { method = "GET", body, auth = false, formData } = {}) {
  const headers = {};
  if (auth) {
    const token = useAuthStore.getState().academicoToken;
    if (!token) {
      sessionExpired();
      throw new QuizApiError(401, "UNAUTHORIZED", "Inicia sesión como académico.");
    }
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new QuizApiError(0, "NETWORK", "No hay conexión con el servidor. Revisa tu internet.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && auth) sessionExpired();
    const detail = data?.detail;
    throw new QuizApiError(
      response.status,
      detail?.code ?? "ERROR",
      detail?.message ?? (typeof detail === "string" ? detail : "Ocurrió un error. Intenta de nuevo."),
    );
  }
  return data;
}

/* ── Académicos ── */

export const getAdminQuizzes = () => request("/admin", { auth: true });

export const getAdminQuiz = (quizId) => request(`/admin/${quizId}`, { auth: true });

export const getQuizVersion = (versionId) => request(`/admin/versions/${versionId}`, { auth: true });

export function uploadQuizDocx(quizId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return request(`/admin/${quizId}/upload`, { method: "POST", auth: true, formData });
}

export const gradeQuizPreview = (versionId, answers) =>
  request(`/admin/versions/${versionId}/grade`, { method: "POST", auth: true, body: { answers } });

export const publishQuizVersion = (versionId) =>
  request(`/admin/versions/${versionId}/publish`, { method: "POST", auth: true, body: {} });

export const getQuizDocxUrl = (versionId) => request(`/admin/versions/${versionId}/docx`, { auth: true });

export const getQuizStats = (quizId, versionId) =>
  request(`/admin/${quizId}/stats${versionId ? `?versionId=${versionId}` : ""}`, { auth: true });

async function sha256Hex(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function putToBucket(upload, file, onProgress) {
  // XMLHttpRequest (no fetch) para poder mostrar el avance de la subida
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(upload.method, upload.url);
    Object.entries(upload.headers ?? {}).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((100 * event.loaded) / event.total));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new QuizApiError(xhr.status, "UPLOAD_FAILED", "No se pudo subir el archivo. Intenta de nuevo."));
    xhr.onerror = () => reject(new QuizApiError(0, "NETWORK", "Se perdió la conexión al subir el archivo."));
    xhr.send(file);
  });
}

/**
 * Sube un audio o video que pide el Word: el navegador lo envía directo al bucket.
 * Si el mismo archivo ya estaba en el servidor, solo se registra.
 * Devuelve { fileName, pending } (archivos que aún faltan en la versión).
 */
export async function uploadQuizMedia(versionId, file, onProgress) {
  const sha256 = await sha256Hex(file);
  const ticket = await request(`/admin/versions/${versionId}/media-upload-url`, {
    method: "POST",
    auth: true,
    body: { fileName: file.name, sha256, sizeBytes: file.size },
  });
  if (ticket.alreadyUploaded) {
    onProgress?.(100);
    return { fileName: ticket.fileName, pending: ticket.pending };
  }
  await putToBucket(ticket.upload, file, onProgress);
  return request(`/admin/versions/${versionId}/media-complete`, {
    method: "POST",
    auth: true,
    body: { fileName: ticket.fileName, sha256 },
  });
}

/* ── Estudiantes (fase 6) ── */

export const getAvailableQuizzes = (idInscripcion) => request(`/available/${idInscripcion}`);

export const startQuiz = (quizId, idInscripcion) =>
  request(`/${quizId}/start`, { method: "POST", body: { idInscripcion } });

export const getQuizAttempt = (attemptId, idInscripcion) =>
  request(`/attempts/${attemptId}?idInscripcion=${idInscripcion}`);

export const submitQuizAttempt = (attemptId, idInscripcion, answers) =>
  request(`/attempts/${attemptId}/submit`, { method: "POST", body: { idInscripcion, answers } });
