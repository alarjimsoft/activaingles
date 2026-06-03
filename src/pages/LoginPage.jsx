import { useState } from "react";

import { useNavigate } from "react-router-dom";

import useAuthStore from "../store/authStore";

import { loginStudent } from "../services/authService";

export default function LoginPage() {
  const navigate = useNavigate();

  const login = useAuthStore((state) => state.login);

  const [matricula, setMatricula] = useState("");

  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const handleLogin = async () => {
    try {
      setLoading(true);

      setError("");

      const result = await loginStudent(matricula, password);

      if (!result.success) {
        setError(result.message || "No se pudo completar el inicio de sesión. Intenta de nuevo.");

        return;
      }

      login(result.student, result.inscripcion);
      console.log(result);

      navigate("/dashboard");
    } catch (err) {
      setError("Error de conexión. Verifica tu internet e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="
        min-h-screen
        bg-black
        flex
        items-center
        justify-center
      "
    >
      <div
        className="
          bg-zinc-900
          p-10
          rounded-3xl
          w-full
          max-w-md
          space-y-6
        "
      >
        <h1
          className="
            text-3xl
            text-white
            font-bold
            text-center
          "
        >
          Activa Inglés
        </h1>

        <input
          type="text"
          placeholder="Matrícula"
          value={matricula}
          onChange={(e) => setMatricula(e.target.value)}
          className="
            w-full
            bg-zinc-800
            text-white
            rounded-xl
            p-4
          "
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="
            w-full
            bg-zinc-800
            text-white
            rounded-xl
            p-4
          "
        />

        {error && (
          <p
            className="
              text-red-400
              text-sm
            "
          >
            {error}
          </p>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="
            w-full
            bg-cyan-500
            text-black
            font-semibold
            rounded-xl
            p-4
          "
        >
          {loading ? "Loading..." : "Login"}
        </button>
      </div>
    </div>
  );
}
