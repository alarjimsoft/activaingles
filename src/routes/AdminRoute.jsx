import { Navigate } from "react-router-dom";

import useAuthStore from "../store/authStore";

export default function AdminRoute({ children }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userType = useAuthStore((state) => state.userType);

  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (userType !== "academico") return <Navigate to="/dashboard" replace />;

  return children;
}
