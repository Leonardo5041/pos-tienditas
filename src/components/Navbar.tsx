import { NavLink } from "react-router-dom";
import { Home, ShoppingCart, Package, BookOpen, BarChart2, Wallet, DollarSign } from "lucide-react";
import { useIsMobile } from "@/hooks/useBreakpoint";
import { useAuthStore } from "@/stores/authStore";

export default function Navbar() {
  const isMobile = useIsMobile();
  const { user } = useAuthStore();
  const role = user?.role;

  if (!isMobile) return null;

  const tabs = [
    { to: "/dashboard", label: "Inicio",    Icon: Home         },
    { to: "/scanner",   label: "Vender",    Icon: ShoppingCart },
    { to: "/inventory", label: "Stock",     Icon: Package      },
    { to: "/credit",    label: "Fiado",     Icon: BookOpen     },
    { to: "/expenses",  label: "Gastos",    Icon: Wallet       },
    ...(role === "owner" || role === "cashier"
      ? [{ to: "/registers", label: "Caja", Icon: DollarSign }]
      : []),
    { to: "/reports",   label: "Reportes",  Icon: BarChart2    },
  ];

  return (
    <nav
      className="flex"
      style={{
        position:      "fixed",
        bottom:        0,
        left:          0,
        right:         0,
        height:        "calc(64px + env(safe-area-inset-bottom))",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingTop:    "8px",
        alignItems:    "flex-start",
        background:    "#1a1a1a",
        borderTop:     "1px solid rgba(255,255,255,0.08)",
        zIndex:        50,
      }}
    >
      {tabs.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center gap-[3px] py-1.5 transition-colors ${
              isActive ? "text-accent" : "text-text3"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={20} strokeWidth={isActive ? 2.25 : 2} />
              <span className="text-[10px] font-medium leading-none">{label}</span>
              <span
                className={`mt-[1px] h-1 w-1 rounded-full bg-accent transition-opacity ${
                  isActive ? "opacity-100" : "opacity-0"
                }`}
              />
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
