import { BrowserRouter, Routes, Route } from "react-router-dom";

import Dashboard from "../pages/Dashboard";
import Library from "../pages/Library";
import Progress from "../pages/Progress";
import Profile from "../pages/Profile";
import MissionPage from "../pages/MissionPage";
import { AnimatePresence } from "framer-motion";
export default function AppRouter() {
  return (
    <BrowserRouter>
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={<Dashboard />} />

          <Route path="/library" element={<Library />} />

          <Route path="/progress" element={<Progress />} />

          <Route path="/profile" element={<Profile />} />

          <Route path="/missions/:id" element={<MissionPage />} />
        </Routes>
      </AnimatePresence>
    </BrowserRouter>
  );
}
