import { useState } from "react";

import { useNavigate } from "react-router-dom";

import useAuthStore from "../store/authStore";

import { loginStudent, loginAcademico } from "../services/authService";

import { GraduationCap, BookOpen } from "lucide-react";

export default function LoginPage() {
  const navigate = useNavigate();

  const login = useAuthStore((state) => state.login);
  const loginAcademicoStore = useAuthStore((state) => state.loginAcademico);

  const [mode, setMode] = useState("student"); // 'student' | 'academico'
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function switchMode(newMode) {
    setMode(newMode);
    setIdentifier("");
    setPassword("");
    setError("");
  }

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError("");

      if (mode === "student") {
        const result = await loginStudent(identifier, password);

        if (!result.success) {
          setError(
            result.message ||
              "No se pudo completar el inicio de sesión. Intenta de nuevo.",
          );
          return;
        }

        login(result.student, result.inscripcion);
        navigate("/dashboard");
      } else {
        const result = await loginAcademico(identifier, password);

        if (!result.success) {
          setError(
            result.message ||
              "No se pudo completar el inicio de sesión. Intenta de nuevo.",
          );
          return;
        }

        loginAcademicoStore(result.academico);
        navigate("/content");
      }
    } catch {
      setError("Error de conexión. Verifica tu internet e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="bg-zinc-900 p-10 rounded-3xl w-full max-w-md space-y-6">
        <h1 className="text-3xl text-white font-bold text-center">
          Activa Inglés
        </h1>

        {/* Mode toggle */}
        <div className="flex bg-zinc-800 rounded-2xl p-1 gap-1">
          <button
            onClick={() => switchMode("student")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${
              mode === "student"
                ? "bg-cyan-500 text-black"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <GraduationCap size={16} />
            Estudiante
          </button>
          <button
            onClick={() => switchMode("academico")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${
              mode === "academico"
                ? "bg-cyan-500 text-black"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <BookOpen size={16} />
            Académico
          </button>
        </div>

        <input
          type="text"
          placeholder={mode === "student" ? "Matrícula" : "ID Académico"}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full bg-zinc-800 text-white rounded-xl p-4"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full bg-zinc-800 text-white rounded-xl p-4"
        />

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-cyan-500 text-black font-semibold rounded-xl p-4 disabled:opacity-60 transition-opacity"
        >
          {loading ? "Loading..." : "Login"}
        </button>
      </div>
    </div>
  );
}
