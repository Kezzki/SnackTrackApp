import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: "penjual" | "pembeli";
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, loading, activeRole } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-primary font-medium">Memuat...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!activeRole) return <Navigate to="/pilih-peran" replace />;
  if (requiredRole && activeRole !== requiredRole) {
    return <Navigate to={activeRole === "pembeli" ? "/toko" : "/"} replace />;
  }

  return <>{children}</>;
}
