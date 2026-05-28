import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import Auth from "./pages/Auth";
import RoleSelection from "./pages/RoleSelection";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Orders from "./pages/Orders";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import BuyerStore from "./pages/BuyerStore";
import BuyerTransactions from "./pages/BuyerTransactions";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <CartProvider>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/pilih-peran" element={<RoleSelection />} />

              {/* Penjual (Seller) Routes */}
              <Route path="/" element={<ProtectedRoute requiredRole="penjual"><Dashboard /></ProtectedRoute>} />
              <Route path="/products" element={<ProtectedRoute requiredRole="penjual"><Products /></ProtectedRoute>} />
              <Route path="/orders" element={<ProtectedRoute requiredRole="penjual"><Orders /></ProtectedRoute>} />
              <Route path="/analytics" element={<ProtectedRoute requiredRole="penjual"><Analytics /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

              {/* Pembeli (Buyer) Routes */}
              <Route path="/toko" element={<ProtectedRoute requiredRole="pembeli"><BuyerStore /></ProtectedRoute>} />
              <Route path="/transaksi" element={<ProtectedRoute requiredRole="pembeli"><BuyerTransactions /></ProtectedRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
