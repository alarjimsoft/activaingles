import {
  LayoutDashboard,
  Library,
  BarChart3,
  User,
  GraduationCap,
} from "lucide-react";

import { NavLink } from "react-router-dom";

const menuItems = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    path: "/",
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
  return (
    <aside className="w-72 min-h-screen bg-zinc-950 border-r border-zinc-800 flex flex-col px-6 py-8">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-12">
        <div className="bg-cyan-500 p-3 rounded-2xl">
          <GraduationCap className="text-white" size={24} />
        </div>

        <div>
          <h1 className="text-white text-2xl font-bold">Activa Inglés</h1>

          <p className="text-zinc-400 text-sm">Mission Control</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-3">
        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.title}
              to={item.path}
              className={({ isActive }) =>
                `
                  flex items-center gap-4
                  px-4 py-4
                  rounded-2xl
                  transition-all duration-300
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
                className="group-hover:scale-110 transition-transform"
              />

              <span className="font-medium">{item.title}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="mt-auto">
        <div
          className="
            bg-zinc-900
            border border-zinc-800
            rounded-3xl
            p-5
          "
        >
          <p className="text-zinc-400 text-sm mb-2">Current Level</p>

          <h2 className="text-cyan-400 text-3xl font-bold">A1</h2>

          <div className="w-full h-2 bg-zinc-800 rounded-full mt-4">
            <div className="w-1/3 h-full bg-cyan-500 rounded-full"></div>
          </div>

          <p className="text-zinc-500 text-xs mt-2">35% completed</p>
        </div>
      </div>
    </aside>
  );
}
