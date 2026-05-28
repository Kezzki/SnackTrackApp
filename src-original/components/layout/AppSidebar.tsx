import { useState, useCallback, useEffect, useRef } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  TrendingUp,
  LogOut,
  ChevronLeft,
  Menu,
  Cookie,
  User,
  Store,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";

const sellerNavItems = [
  { title: "Ringkasan", url: "/", icon: LayoutDashboard },
  { title: "Produk", url: "/products", icon: Package },
  { title: "Transaksi", url: "/orders", icon: ShoppingCart },
  { title: "Prediksi Penjualan", url: "/analytics", icon: TrendingUp },
];

const buyerNavItems = [
  { title: "Shop", url: "/toko", icon: Store },
  { title: "Transaksi", url: "/transaksi", icon: ShoppingBag },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("snacktrack_sidebar_collapsed") === "true";
  });

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("snacktrack_sidebar_collapsed", String(next));
      return next;
    });
  }, []);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, activeRole, signOut } = useAuth();
  const { totalItems } = useCart();

  const isBuyer = activeRole === "pembeli";
  const navItems = isBuyer ? buyerNavItems : sellerNavItems;

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const handleKeranjangClick = () => {
    if (totalItems === 0) {
      // Empty cart — navigate to store with tutorial flag
      navigate("/toko?tutorial=cart");
    } else {
      // Has items — go to store (cart sheet can be opened from there)
      navigate("/toko?openCart=1");
    }
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-primary flex flex-col transition-all duration-300 ease-in-out",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between px-4">
        {!collapsed && (
          <div className="flex items-center gap-2 animate-fade-in">
            <Cookie className="h-5 w-5 text-primary-foreground" />
            <span className="font-bold text-lg text-primary-foreground">
              SnackTrack
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleCollapsed}
          className={cn(
            "h-8 w-8 text-primary-foreground hover:bg-primary-foreground/10",
            collapsed && "mx-auto"
          )}
        >
          {collapsed ? <Menu className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {!collapsed && (
        <p className="px-4 -mt-2 mb-4 text-xs text-primary-foreground/70">
          {isBuyer ? "Dashboard Pembeli" : "Dashboard Penjual"}
        </p>
      )}

      {/* Navigation */}
      <nav className="flex flex-col gap-1 px-3 relative">
        {/* Sliding active indicator */}
        <NavIndicator navItems={navItems} pathname={location.pathname} />

        {navItems.map((item) => {
          const isActive = location.pathname === item.url;
          return (
            <NavLink
              key={item.title}
              to={item.url}
              className={cn(
                "relative z-10 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                isActive
                  ? "text-primary"
                  : "text-primary-foreground/80 hover:bg-primary-foreground/10",
                collapsed && "justify-center px-2"
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span>{item.title}</span>}
            </NavLink>
          );
        })}

        {/* Keranjang - special button for buyer */}
        {isBuyer && (
          <button
            onClick={handleKeranjangClick}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 relative",
              "text-primary-foreground/80 hover:bg-primary-foreground/10",
              collapsed && "justify-center px-2"
            )}
          >
            <ShoppingCart className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span>Keranjang</span>}
            {totalItems > 0 && (
              <Badge className="absolute -top-1 right-1 h-5 min-w-[20px] flex items-center justify-center p-0 text-[10px] bg-white text-primary">
                {totalItems}
              </Badge>
            )}
          </button>
        )}
      </nav>

      {/* Footer - User info & Logout */}
      <div className="mt-auto p-3 border-t border-primary-foreground/20">
        {!collapsed && (
          <div className="flex items-center gap-2 mb-3 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/20">
              <User className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary-foreground truncate">
                {user?.user_metadata?.name || (isBuyer ? "Pembeli" : "Penjual")}
              </p>
              <p className="text-[10px] text-primary-foreground/60 truncate">
                {user?.email}
              </p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          onClick={handleSignOut}
          className={cn(
            "w-full bg-white text-destructive hover:bg-white/90 hover:text-destructive",
            collapsed ? "justify-center px-2" : "justify-start gap-2"
          )}
          size="sm"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="text-sm font-medium">Keluar</span>}
        </Button>
      </div>
    </aside>
  );
}

// ─── Sliding nav indicator that animates across remounts ────────────────
const ITEM_HEIGHT = 40;
const GAP_SIZE = 4;
const STORAGE_KEY = "snacktrack_nav_index";

function NavIndicator({ navItems, pathname }: { navItems: { url: string }[]; pathname: string }) {
  const activeIndex = navItems.findIndex((item) => pathname === item.url);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (activeIndex === -1 || !indicatorRef.current) return;

    const el = indicatorRef.current;
    const prevIndex = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
    const prevY = prevIndex * (ITEM_HEIGHT + GAP_SIZE);
    const nextY = activeIndex * (ITEM_HEIGHT + GAP_SIZE);

    // Start at old position instantly (no transition)
    el.style.transition = "none";
    el.style.transform = `translateY(${prevY}px)`;

    // Force reflow so the browser registers the starting position
    void el.offsetHeight;

    // Animate to new position
    requestAnimationFrame(() => {
      el.style.transition = "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)";
      el.style.transform = `translateY(${nextY}px)`;
    });

    // Save current index for next mount
    localStorage.setItem(STORAGE_KEY, String(activeIndex));
    setReady(true);
  }, [activeIndex]);

  if (activeIndex === -1) return null;

  return (
    <div
      ref={indicatorRef}
      className="absolute left-3 right-3 rounded-lg bg-primary-foreground shadow-sm pointer-events-none"
      style={{
        height: `${ITEM_HEIGHT}px`,
        opacity: ready ? 1 : 0,
      }}
    />
  );
}
