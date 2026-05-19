import { create } from "zustand";

const useAuthStore = create((set) => ({
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
}));

export default useAuthStore;
