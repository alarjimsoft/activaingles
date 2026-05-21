import {
  LayoutDashboard,
  Library,
  BarChart3,
  User,
  GraduationCap,
  LogOut,
} from "lucide-react";

import { NavLink, useNavigate } from "react-router-dom";

import { motion } from "framer-motion";

import { useEffect, useState } from "react";

import useAuthStore from "../../store/authStore";

import { getDashboardStats } from "../../services/dashboardService";

const menuItems = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    path: "/dashboard",
  },

  {
    title: "Library",
    icon: Library,
    path: "/library",
  },

  {
    title: "Progress",
    icon: BarChart3,
    path: "/progress",
  },

  {
    title: "Profile",
    icon: User,
    path: "/profile",
  },
];

export default function Sidebar() {
  const navigate = useNavigate();

  const logout = useAuthStore((state) => state.logout);

  const student = useAuthStore((state) => state.student);

  const inscripcion = useAuthStore((state) => state.inscripcion);

  const [stats, setStats] = useState(null);

  useEffect(() => {
    async function loadStats() {
      try {
        if (!inscripcion) return;

        const data = await getDashboardStats(inscripcion.idInscripcion);

        setStats(data);
      } catch (error) {
        console.error(error);
      }
    }

    loadStats();
  }, [inscripcion]);

  function handleLogout() {
    logout();

    navigate("/");
  }

  return (
    <aside
      className="
        w-72
        min-h-screen
        bg-zinc-950
        border-r
        border-zinc-800
        flex
        flex-col
        px-6
        py-8
      "
    >
      {/* Logo */}
      <motion.div
        className="
          flex
          items-center
          gap-3
          mb-12
        "
        initial={{
          opacity: 0,
          x: -20,
        }}
        animate={{
          opacity: 1,
          x: 0,
        }}
        transition={{
          duration: 0.5,
        }}
      >
        <div
          className="
            bg-cyan-500
            p-3
            rounded-2xl
          "
        >
          <GraduationCap className="text-white" size={24} />
        </div>

        <div>
          <h1
            className="
              text-white
              text-2xl
              font-bold
            "
          >
            Activa Inglés
          </h1>

          <p
            className="
              text-zinc-400
              text-sm
            "
          >
            Mission Control
          </p>
        </div>
      </motion.div>

      {/* Navigation */}
      <nav
        className="
          flex
          flex-col
          gap-3
        "
      >
        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <motion.div
              key={item.title}
              whileHover={{
                x: 5,
              }}
              whileTap={{
                scale: 0.98,
              }}
            >
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `
                  flex
                  items-center
                  gap-4
                  px-4 py-4
                  rounded-2xl
                  transition-all
                  duration-300
                  group
                  ${
                    isActive
                      ? "bg-cyan-500 text-black"
                      : "text-zinc-300 hover:bg-zinc-900 hover:text-cyan-400"
                  }
                `
                }
              >
                <Icon
                  size={22}
                  className="
                    group-hover:scale-110
                    transition-transform
                  "
                />

                <span className="font-medium">{item.title}</span>
              </NavLink>
            </motion.div>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="mt-auto">
        <div
          className="
            bg-zinc-900
            border
            border-zinc-800
            rounded-3xl
            p-5
          "
        >
          <p
            className="
              text-zinc-400
              text-sm
              mb-2
            "
          >
            Current Level
          </p>

          <h2
            className="
              text-cyan-400
              text-3xl
              font-bold
            "
          >
            {student?.nivel || "A1"}
          </h2>

          {/* Progress Bar */}
          <div
            className="
              w-full
              h-2
              bg-zinc-800
              rounded-full
              mt-4
            "
          >
            <div
              className="
                h-full
                bg-cyan-500
                rounded-full
                transition-all
                duration-500
              "
              style={{
                width: `${stats?.avg_progress || 0}%`,
              }}
            />
          </div>

          <p
            className="
              text-zinc-500
              text-xs
              mt-2
            "
          >
            {stats?.avg_progress || 0}% completed
          </p>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="
            w-full
            mt-4
            flex
            items-center
            justify-center
            gap-3
            bg-red-500/20
            hover:bg-red-500
            text-red-400
            hover:text-white
            py-4
            rounded-2xl
            transition-all
          "
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </aside>
  );
}
