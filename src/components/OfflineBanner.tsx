import { useState, useEffect } from "react";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useProductSync } from "@/hooks/useProductSync";
import { WifiOff, RefreshCw } from "lucide-react";
import { useBreakpoint } from "@/hooks/useBreakpoint";

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { pendingCount: pendingSales, failedCount, isSyncing: syncingSales, syncedMessage: salesMsg, retryAllFailed } = useOfflineSync();
  const { pendingCount: pendingProducts, isSyncing: syncingProducts, syncedMessage: productsMsg } = useProductSync();
  const bp = useBreakpoint();
  const leftOffset = bp === "desktop" ? 260 : bp === "tablet" ? 220 : 0;

  const totalPending = pendingSales + pendingProducts;
  const isSyncing = syncingSales || syncingProducts;
  const syncedMessage = salesMsg ?? productsMsg;

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

  if (isOnline && !isSyncing && !syncedMessage && totalPending === 0 && failedCount === 0) return null;

  const bannerStyle = { left: leftOffset };

  if (!isOnline) {
    return (
      <div className="fixed top-0 right-0 z-50 bg-red-600 text-white px-4 py-2 flex items-center gap-2 text-sm transition-all" style={bannerStyle}>
        <WifiOff size={16} />
        <span>
          Sin conexión — los cambios se guardan localmente
          {totalPending > 0 && ` (${totalPending} pendientes)`}
        </span>
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div className="fixed top-0 right-0 z-50 bg-amber-500 text-white px-4 py-2 flex items-center gap-2 text-sm transition-all" style={bannerStyle}>
        <RefreshCw size={16} className="animate-spin" />
        <span>Sincronizando {totalPending} {totalPending === 1 ? "cambio" : "cambios"}...</span>
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

  if (failedCount > 0) {
    return (
      <div
        className="fixed top-0 right-0 z-50 px-4 py-2 flex items-center gap-3 text-sm transition-all"
        style={{ ...bannerStyle, background: "rgba(255,107,107,0.15)", borderBottom: "1px solid rgba(255,107,107,0.3)", color: "#ff6b6b" }}
      >
        <span>⚠️ {failedCount} venta{failedCount !== 1 ? "s" : ""} no {failedCount !== 1 ? "pudieron" : "pudo"} sincronizarse</span>
        <button
          onClick={() => void retryAllFailed()}
          className="px-2 py-0.5 rounded text-xs font-semibold border"
          style={{ borderColor: "#ff6b6b", color: "#ff6b6b" }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  return null;
}
