import { create } from "zustand";

import { persist } from "zustand/middleware";

const LOGGED_OUT = {
  student: null,
  inscripcion: null,
  academico: null,
  academicoToken: null,
  academicoTokenExpires: null,
  userType: null,
  rol: null,
  isAuthenticated: false,
};

const useAuthStore = create(
  persist(
    (set) => ({
      student: null,
      inscripcion: null,
      academico: null,
      academicoToken: null,        // token de FastAPI para las rutas de quizzes
      academicoTokenExpires: null, // segundos desde 1970 (exp del token)
      userType: null, // 'student' | 'academico'
      rol: null,      // null para estudiantes; 'ADMIN', 'DOCENTE', etc. para académicos
      isAuthenticated: false,

      login: (student, inscripcion) =>
        set({
          ...LOGGED_OUT,
          student,
          inscripcion,
          userType: "student",
          isAuthenticated: true,
        }),

      loginAcademico: (academico, token, tokenExpires) =>
        set({
          ...LOGGED_OUT,
          academico,
          academicoToken: token,
          academicoTokenExpires: tokenExpires,
          userType: "academico",
          rol: academico.rol ?? null,
          isAuthenticated: true,
        }),

      logout: () => set(LOGGED_OUT),
    }),

    {
      name: "activa-ingles-auth",
      // v1: los académicos necesitan el token de FastAPI. Una sesión de académico guardada
      // antes (sin token) se cierra para que vuelva a entrar; la de estudiantes se conserva.
      version: 1,
      migrate: (persisted, version) => {
        if (version < 1 && persisted?.userType === "academico") {
          return { ...persisted, ...LOGGED_OUT };
        }
        return { ...LOGGED_OUT, ...persisted };
      },
    },
  ),
);

export default useAuthStore;
