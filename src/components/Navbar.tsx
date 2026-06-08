import { NavLink } from "react-router-dom";
import { Home, ShoppingCart, Package, BookOpen, BarChart2 } from "lucide-react";
import { useIsMobile } from "@/hooks/useBreakpoint";

const tabs = [
  { to: "/dashboard", label: "Inicio", Icon: Home },
  { to: "/scanner", label: "Vender", Icon: ShoppingCart },
  { to: "/inventory", label: "Stock", Icon: Package },
  { to: "/credit", label: "Fiado", Icon: BookOpen },
  { to: "/reports", label: "Reportes", Icon: BarChart2 },
] as const;

export default function Navbar() {
  const isMobile = useIsMobile();
  if (!isMobile) return null;
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex bg-surface border-t border-white/[0.08] pb-5 pt-2">
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
