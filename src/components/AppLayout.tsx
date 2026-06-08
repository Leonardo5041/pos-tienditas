import { Outlet } from "react-router-dom";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import Sidebar from "@/components/Sidebar";
import { TrialBanner } from "@/components/TrialBanner";
import { useAuthStore } from "@/stores/authStore";

export default function AppLayout() {
  const bp = useBreakpoint();
  const { store } = useAuthStore();
  const showTrial = store?.is_on_trial === true && store?.plan === 'free';

  if (bp === "mobile") {
    return (
      <>
        <TrialBanner />
        <div style={{ paddingTop: showTrial ? '40px' : '0' }}>
          <Outlet />
        </div>
      </>
    );
  }

  const sidebarWidth = bp === "desktop" ? 260 : 220;

  return (
    <>
      <TrialBanner />
      <div style={{ display: "flex", minHeight: "100vh", background: "#0f0f0f", paddingTop: showTrial ? '40px' : '0' }}>
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
    </>
  );
}
