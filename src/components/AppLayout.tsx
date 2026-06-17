import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import Sidebar from "@/components/Sidebar";
import { TrialBanner } from "@/components/TrialBanner";
import { useAuthStore } from "@/stores/authStore";
import { useEffect } from "react";

export default function AppLayout() {
  const bp = useBreakpoint();
  const { store } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const trialExpired = !store?.is_on_trial && store?.effective_plan === "free";
  const showTrial = (store?.is_on_trial === true && store?.plan === 'free') || trialExpired;

  useEffect(() => {
    if (trialExpired && location.pathname !== "/subscription") {
      navigate("/subscription", { replace: true });
    }
  }, [trialExpired, location.pathname, navigate]);

  if (bp === "mobile") {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0f0f0f',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: '64px',
      }}>
        <TrialBanner />
        <div style={{ paddingTop: showTrial ? '40px' : '0' }}>
          <Outlet />
        </div>
      </div>
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
