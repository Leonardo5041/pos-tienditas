import { Outlet } from "react-router-dom";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import Sidebar from "@/components/Sidebar";

export default function AppLayout() {
  const bp = useBreakpoint();

  if (bp === "mobile") {
    return <Outlet />;
  }

  const sidebarWidth = bp === "desktop" ? 260 : 220;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0f0f0f" }}>
      <Sidebar />
      <main
        style={{
          flex:       1,
          marginLeft: sidebarWidth,
          minHeight:  "100vh",
          overflow:   "auto",
          ...(bp === "desktop"
            ? { display: "flex", justifyContent: "center" }
            : {}),
        }}
      >
        {bp === "desktop" ? (
          <div style={{ width: "100%", maxWidth: 800, padding: "0 24px" }}>
            <Outlet />
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
