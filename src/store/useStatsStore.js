import { create } from "zustand";
import { getDashboardStats } from "../services/dashboardService";

const useStatsStore = create((set, get) => ({
  stats: null,
  loading: false,

  fetchStats: async (idInscripcion) => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const data = await getDashboardStats(idInscripcion);
      set({ stats: data });
    } catch (error) {
      console.error(error);
    } finally {
      set({ loading: false });
    }
  },

  // Llamar después de completar una misión para refrescar los datos
  invalidate: () => set({ stats: null }),
}));

export default useStatsStore;
