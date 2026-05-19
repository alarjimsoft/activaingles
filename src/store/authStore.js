import { create } from "zustand";

import { persist } from "zustand/middleware";

const useAuthStore = create(
  persist(
    (set) => ({
      student: null,

      inscripcion: null,

      isAuthenticated: false,

      login: (student, inscripcion) =>
        set({
          student,

          inscripcion,

          isAuthenticated: true,
        }),

      logout: () =>
        set({
          student: null,

          inscripcion: null,

          isAuthenticated: false,
        }),
    }),

    {
      name: "activa-ingles-auth",
    },
  ),
);

export default useAuthStore;
