import { create } from "zustand";
import { persist } from "zustand/middleware";

const useAppStore = create(
  persist(
    (set, get) => ({
      // User
      currentUser: {
        id: 1,
        name: "Luis Angel",
        level: "A1",
        xp: 120,
      },

      // Missions
      missions: [],

      setMissions: (missions) =>
        set({
          missions,
        }),

      currentMission: null, // missions[0],

      setCurrentMission: (mission) =>
        set({
          currentMission: mission,
        }),

      // Conversations
      conversations: {},

      // Get conversation by mission
      getConversation: (missionId) => {
        const conversations = get().conversations;

        return conversations[missionId] || [];
      },

      // Add message
      addMessage: (missionId, message) =>
        set((state) => ({
          conversations: {
            ...state.conversations,

            [missionId]: [...(state.conversations[missionId] || []), message],
          },
        })),

      // Replace entire conversation (used by loadHistory to avoid duplicates)
      setConversation: (missionId, messages) =>
        set((state) => ({
          conversations: {
            ...state.conversations,

            [missionId]: messages,
          },
        })),
    }),

    {
      name: "activa-ingles-store",

      version: 1,

      migrate: (persistedState, version) => {
        if (version === 0) {
          return { ...persistedState, conversations: {} };
        }
        return persistedState;
      },
    },
  ),
);

export default useAppStore;
