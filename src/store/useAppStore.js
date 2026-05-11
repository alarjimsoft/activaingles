import { create } from "zustand";

import { missions } from "../data/missions";

const useAppStore = create((set) => ({
  currentUser: {
    id: 1,
    name: "Luis Angel",
    level: "A1",
    xp: 120,
  },

  missions,

  currentMission: missions[0],

  setCurrentMission: (mission) =>
    set({
      currentMission: mission,
    }),
}));

export default useAppStore;
