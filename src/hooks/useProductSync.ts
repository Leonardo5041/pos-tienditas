import { useState, useEffect, useCallback, useRef } from "react";
import { pendingProductsDb } from "@/lib/db";
import { productsApi } from "@/lib/products";
import type { Product } from "@/types/product";

const CACHE_KEY = "products_cache";

function readCache(): Product[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeCache(products: Product[]) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(products));
}

export function useProductSync() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncedMessage, setSyncedMessage] = useState<string | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshCount = useCallback(async () => {
    const count = await pendingProductsDb.count();
    setPendingCount(count);
  }, []);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  const sync = useCallback(async () => {
    const pending = await pendingProductsDb.getUnsynced();
    if (!pending.length) return;

    setIsSyncing(true);
    let syncedCount = 0;
    const tempIdMap = new Map<string, string>();

    try {
      for (const op of pending) {
        try {
          if (op.type === "create" && op.payload && op.temp_id) {
            const created = await productsApi.create(op.payload);
            tempIdMap.set(op.temp_id, created.id);
            const cache = readCache();
            const idx = cache.findIndex((p) => p.id === op.temp_id);
            if (idx >= 0) cache[idx] = created;
            else cache.push(created);
            writeCache(cache);
            await pendingProductsDb.markSynced(op.id);
            syncedCount++;
          } else if (op.type === "update" && op.payload && op.product_id) {
            const realId = tempIdMap.get(op.product_id) ?? op.product_id;
            if (realId.startsWith("tmp_")) continue;
            const updated = await productsApi.update(realId, op.payload);
            const cache = readCache();
            const idx = cache.findIndex((p) => p.id === realId);
            if (idx >= 0) cache[idx] = updated;
            writeCache(cache);
            await pendingProductsDb.markSynced(op.id);
            syncedCount++;
          } else if (op.type === "delete" && op.product_id) {
            const realId = tempIdMap.get(op.product_id) ?? op.product_id;
            if (!realId.startsWith("tmp_")) {
              await productsApi.remove(realId);
            }
            await pendingProductsDb.markSynced(op.id);
            syncedCount++;
          }
        } catch {
          // individual op failed — retry on next sync
        }
      }
    } finally {
      await refreshCount();
      setIsSyncing(false);
      if (syncedCount > 0) {
        if (messageTimer.current) clearTimeout(messageTimer.current);
        setSyncedMessage(
          syncedCount === 1
            ? "1 producto sincronizado"
            : `${syncedCount} productos sincronizados`
        );
        messageTimer.current = setTimeout(() => setSyncedMessage(null), 3000);
      }
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
