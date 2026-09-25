import { create } from "zustand";

import { persist } from "zustand/middleware";

const useAuthStore = create(
  persist(
    (set) => ({
      student: null,
      inscripcion: null,
      academico: null,
      userType: null, // 'student' | 'academico'
      rol: null,      // null para estudiantes; 'ADMIN', 'DOCENTE', etc. para académicos
      isAuthenticated: false,

      login: (student, inscripcion) =>
        set({
          student,
          inscripcion,
          academico: null,
          userType: "student",
          rol: null,
          isAuthenticated: true,
        }),

      loginAcademico: (academico) =>
        set({
          academico,
          student: null,
          inscripcion: null,
          userType: "academico",
          rol: academico.rol ?? null,
          isAuthenticated: true,
        }),

      logout: () =>
        set({
          student: null,
          inscripcion: null,
          academico: null,
          userType: null,
          rol: null,
          isAuthenticated: false,
        }),
    }),

    {
      name: "activa-ingles-auth",
    },
  ),
);

export default useAuthStore;
