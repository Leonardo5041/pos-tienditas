import { useState, useEffect, useCallback, useRef } from "react";
import { salesApi } from "@/lib/sales";
import { pendingSalesDb } from "@/lib/db";
import { useAuthStore } from "@/stores/authStore";

export function useOfflineSync() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncedMessage, setSyncedMessage] = useState<string | null>(null);
  const [failedCount, setFailedCount] = useState(0);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    const count = await pendingSalesDb.count();
    setPendingCount(count);
  }, []);

  const refreshFailedCount = useCallback(async () => {
    const count = await pendingSalesDb.countFailed();
    setFailedCount(count);
  }, []);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    refreshFailedCount();
  }, [refreshFailedCount]);

  const sync = useCallback(async () => {
    if (isSyncingRef.current) return;
    const pending = await pendingSalesDb.getUnsynced();
    if (!pending.length) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const payload = pending.map((s) => ({
        id: s.id,
        items: s.items,
        payment_method: s.payment_method,
        created_at: s.created_at,
      }));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      let result: { synced: number; errors: { index: number; error: string }[] };
      try {
        result = await salesApi.sync(payload, controller.signal);
      } finally {
        clearTimeout(timeoutId);
      }

      const failedIndexes = new Set(result.errors?.map((e) => e.index) ?? []);
      for (let i = 0; i < pending.length; i++) {
        if (!failedIndexes.has(i)) {
          await pendingSalesDb.markSynced(pending[i].id);
        } else {
          await pendingSalesDb.incrementRetry(pending[i].id, pending[i].retries ?? 0);
        }
      }

      await refreshCount();
      await refreshFailedCount();

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
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [refreshCount, refreshFailedCount]);

  useEffect(() => {
    if (navigator.onLine) void sync();
    const handleOnline = () => void sync();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [sync]);

  useEffect(() => {
    if (isAuthenticated && navigator.onLine) void sync();
  }, [isAuthenticated, sync]);

  useEffect(() => {
    return () => {
      if (messageTimer.current) clearTimeout(messageTimer.current);
    };
  }, []);

  const retryFailed = useCallback(async (id: string) => {
    await pendingSalesDb.resetFailed(id);
    await refreshCount();
    await refreshFailedCount();
  }, [refreshCount, refreshFailedCount]);

  const retryAllFailed = useCallback(async () => {
    await pendingSalesDb.resetAllFailed();
    await refreshCount();
    await refreshFailedCount();
    void sync();
  }, [refreshCount, refreshFailedCount, sync]);

  return { pendingCount, failedCount, isSyncing, syncedMessage, refreshCount, retryFailed, retryAllFailed };
}
