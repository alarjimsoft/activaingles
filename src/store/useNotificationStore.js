import { create } from "zustand";

const useNotificationStore = create((set, get) => ({
  notifications: [],

  addNotification: ({ type, title, message, duration = 4000 }) => {
    const id = Date.now();

    set((state) => ({
      notifications: [
        ...state.notifications,
        { id, type, title, message, duration },
      ],
    }));

    setTimeout(() => {
      get().removeNotification(id);
    }, duration);
  },

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
}));

export default useNotificationStore;
