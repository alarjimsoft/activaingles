import Sidebar from "../components/layout/Sidebar";

export default function MainLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-black">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Top Area */}
        <div className="p-10">{children}</div>
      </main>
    </div>
  );
}
