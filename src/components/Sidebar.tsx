import { useNavigate, useLocation } from "react-router-dom";
import { Home, ShoppingCart, Package, BookOpen, BarChart2, Settings, LogOut } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useIsDesktop } from "@/hooks/useBreakpoint";

const NAV_ITEMS = [
  { path: "/dashboard", icon: Home,          label: "Inicio" },
  { path: "/scanner",   icon: ShoppingCart,  label: "Vender" },
  { path: "/inventory", icon: Package,       label: "Inventario" },
  { path: "/credit",    icon: BookOpen,      label: "Fiado" },
  { path: "/reports",   icon: BarChart2,     label: "Reportes" },
] as const;

export default function Sidebar() {
  const navigate    = useNavigate();
  const location    = useLocation();
  const { user, store, logout } = useAuthStore();
  const isDesktop   = useIsDesktop();
  const width       = isDesktop ? 260 : 220;
  const showTrial   = store?.is_on_trial === true && store?.plan === 'free';

  return (
    <aside
      style={{
        position:        "fixed",
        top:             showTrial ? 40 : 0,
        left:            0,
        bottom:          0,
        width:           width,
        background:      "#111111",
        borderRight:     "1px solid rgba(255,255,255,0.06)",
        display:         "flex",
        flexDirection:   "column",
        zIndex:          100,
        paddingTop:      "env(safe-area-inset-top)",
      }}
    >
      {/* Store header */}
      <div
        style={{
          padding:      "24px 20px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width:           40,
              height:          40,
              borderRadius:    10,
              background:      "rgba(0,229,160,0.1)",
              border:          "1.5px solid rgba(0,229,160,0.25)",
              display:         "flex",
              alignItems:      "center",
              justifyContent:  "center",
              fontSize:        18,
              flexShrink:      0,
            }}
          >
            🏪
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize:     14,
                fontWeight:   700,
                color:        "#f0f0f0",
                overflow:     "hidden",
                textOverflow: "ellipsis",
                whiteSpace:   "nowrap",
              }}
            >
              {store?.name ?? "Mi Tiendita"}
            </div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
              {user?.name}
            </div>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: "12px 10px", overflow: "auto" }}>
        {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
          const active = location.pathname === path || location.pathname.startsWith(path + "/");
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              style={{
                width:         "100%",
                display:       "flex",
                alignItems:    "center",
                gap:           12,
                padding:       "10px 12px",
                borderRadius:  10,
                border:        "none",
                background:    active ? "rgba(0,229,160,0.1)" : "transparent",
                color:         active ? "#00e5a0" : "#666",
                fontFamily:    "DM Sans, sans-serif",
                fontSize:      14,
                fontWeight:    active ? 600 : 400,
                cursor:        "pointer",
                marginBottom:  2,
                transition:    "all 0.15s",
                textAlign:     "left",
              }}
            >
              <Icon size={18} style={{ flexShrink: 0 }} />
              {label}
              {active && (
                <div
                  style={{
                    marginLeft:  "auto",
                    width:       4,
                    height:      4,
                    borderRadius: "50%",
                    background:  "#00e5a0",
                  }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        style={{
          padding:       "12px 10px",
          borderTop:     "1px solid rgba(255,255,255,0.06)",
          paddingBottom: isDesktop
            ? 24
            : "calc(env(safe-area-inset-bottom) + 12px)",
        }}
      >
        <button
          onClick={() => navigate("/settings")}
          style={{
            width:        "100%",
            display:      "flex",
            alignItems:   "center",
            gap:          12,
            padding:      "10px 12px",
            borderRadius: 10,
            border:       "none",
            background:   location.pathname === "/settings"
              ? "rgba(255,255,255,0.05)"
              : "transparent",
            color:        "#555",
            fontFamily:   "DM Sans, sans-serif",
            fontSize:     14,
            cursor:       "pointer",
            marginBottom: 4,
          }}
        >
          <Settings size={18} />
          Configuración
        </button>
        <button
          onClick={() => {
            logout();
            navigate("/login", { replace: true });
          }}
          style={{
            width:        "100%",
            display:      "flex",
            alignItems:   "center",
            gap:          12,
            padding:      "10px 12px",
            borderRadius: 10,
            border:       "none",
            background:   "transparent",
            color:        "rgba(255,107,107,0.6)",
            fontFamily:   "DM Sans, sans-serif",
            fontSize:     14,
            cursor:       "pointer",
          }}
        >
          <LogOut size={18} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
