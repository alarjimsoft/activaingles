import { create } from "zustand";
import { persist } from "zustand/middleware";

import { missions } from "../data/missions";

const initialConversation = {
  1: [
    {
      id: 1,
      sender: "tutor",
      text: `
Hello 👋

Today we will practice:

Introduce Yourself

Tell me something about yourself.
      `,
    },
  ],

  2: [
    {
      id: 1,
      sender: "tutor",
      text: `
Welcome to the Coffee Shop mission ☕

Try ordering a drink in English.
      `,
    },
  ],

  3: [
    {
      id: 1,
      sender: "tutor",
      text: `
Let’s talk about your daily routine 📚
      `,
    },
  ],
};

const useAppStore = create(
  persist((set, get) => ({
    // User
    currentUser: {
      id: 1,
      name: "Luis Angel",
      level: "A1",
      xp: 120,
    },

    // Missions
    missions,

    currentMission: missions[0],

    setCurrentMission: (mission) =>
      set({
        currentMission: mission,
      }),

    // Conversations
    conversations: initialConversation,

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
  })),
);

export default useAppStore;
