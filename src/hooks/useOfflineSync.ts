import { useState, useEffect, useCallback, useRef } from "react";
import { salesApi } from "@/lib/sales";
import { pendingSalesDb } from "@/lib/db";

export function useOfflineSync() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncedMessage, setSyncedMessage] = useState<string | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshCount = useCallback(async () => {
    const count = await pendingSalesDb.count();
    setPendingCount(count);
  }, []);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  const sync = useCallback(async () => {
    const pending = await pendingSalesDb.getUnsynced();
    if (!pending.length) return;

    setIsSyncing(true);
    try {
      const payload = pending.map((s) => ({
        items: s.items,
        payment_method: s.payment_method,
        created_at: s.created_at,
      }));

      const result = await salesApi.sync(payload);

      const failedIndexes = new Set(result.errors?.map((e) => e.index) ?? []);
      for (let i = 0; i < pending.length; i++) {
        if (!failedIndexes.has(i)) {
          await pendingSalesDb.markSynced(pending[i].id);
        }
      }

      await refreshCount();

      const syncedCount = pending.length - failedIndexes.size;
      if (syncedCount > 0) {
        if (messageTimer.current) clearTimeout(messageTimer.current);
        setSyncedMessage(
          syncedCount === 1 ? "1 venta sincronizada" : `${syncedCount} ventas sincronizadas`
        );
        messageTimer.current = setTimeout(() => setSyncedMessage(null), 3000);
      }
    } catch {
      // red caída — reintentar en próximo online event
    } finally {
      setIsSyncing(false);
    }
  }, [refreshCount]);

  useEffect(() => {
    if (navigator.onLine) void sync();
    const handleOnline = () => void sync();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [sync]);

  useEffect(() => {
    return () => {
      if (messageTimer.current) clearTimeout(messageTimer.current);
    };
  }, []);

  return { pendingCount, isSyncing, syncedMessage, refreshCount };
}
