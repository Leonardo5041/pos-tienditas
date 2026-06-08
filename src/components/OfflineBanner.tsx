import { useState, useEffect } from "react";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { WifiOff, RefreshCw } from "lucide-react";
import { useBreakpoint } from "@/hooks/useBreakpoint";

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { pendingCount, isSyncing, syncedMessage } = useOfflineSync();
  const bp = useBreakpoint();
  const leftOffset = bp === "desktop" ? 260 : bp === "tablet" ? 220 : 0;

  useEffect(() => {
    const setOnline = () => setIsOnline(true);
    const setOffline = () => setIsOnline(false);
    window.addEventListener("online", setOnline);
    window.addEventListener("offline", setOffline);
    return () => {
      window.removeEventListener("online", setOnline);
      window.removeEventListener("offline", setOffline);
    };
  }, []);

  if (isOnline && !isSyncing && !syncedMessage && pendingCount === 0) return null;

  const bannerStyle = { left: leftOffset };

  if (!isOnline) {
    return (
      <div className="fixed top-0 right-0 z-50 bg-red-600 text-white px-4 py-2 flex items-center gap-2 text-sm transition-all" style={bannerStyle}>
        <WifiOff size={16} />
        <span>
          Sin conexión — las ventas se guardan localmente
          {pendingCount > 0 && ` (${pendingCount} pendientes)`}
        </span>
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div className="fixed top-0 right-0 z-50 bg-amber-500 text-white px-4 py-2 flex items-center gap-2 text-sm transition-all" style={bannerStyle}>
        <RefreshCw size={16} className="animate-spin" />
        <span>Sincronizando {pendingCount} {pendingCount === 1 ? "venta" : "ventas"}...</span>
      </div>
    );
  }

  if (syncedMessage) {
    return (
      <div className="fixed top-0 right-0 z-50 bg-green-600 text-white px-4 py-2 flex items-center gap-2 text-sm transition-all" style={bannerStyle}>
        <span>✓ {syncedMessage}</span>
      </div>
    );
  }

  return null;
}
