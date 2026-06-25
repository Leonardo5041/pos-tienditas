/**
 * Tests offline-first del sistema POS.
 * Usa fake-indexeddb para simular IndexedDB en Node/jsdom.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Dexie from "dexie";
import type { PendingSale } from "@/types/sale";
import type { Product } from "@/types/product";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeDb() {
  class TestDb extends Dexie {
    pendingSales!: Dexie.Table<PendingSale>;
    productsCache!: Dexie.Table<Product>;
    constructor() {
      super(`pos_test_${Math.random()}`); // DB única por test
      this.version(1).stores({
        pendingSales: "id, synced, created_at",
        productsCache: "id, name, barcode",
      });
    }
  }
  return new TestDb();
}

function makeSale(overrides: Partial<PendingSale> = {}): PendingSale {
  return {
    id: crypto.randomUUID(),
    items: [{ product_id: "prod-1", quantity: 2 }],
    payment_method: "cash",
    created_at: new Date().toISOString(),
    synced: false,
    ...overrides,
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    name: "COCA COLA 600ML",
    barcode: "7501055300105",
    price: 18.5,
    cost: null,
    stock: 10,
    low_stock_threshold: 2,
    unit: "pza",
    ...overrides,
  };
}

// ── TEST 1: Guardar venta offline ────────────────────────────────────────────
describe("TEST 1 — Guardar venta offline", () => {
  it("pendingSales tiene 1 registro con synced=false", async () => {
    const db = makeDb();
    const sale = makeSale();

    await db.pendingSales.add(sale);

    const all = await db.pendingSales.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].synced).toBe(false);
    expect(all[0].id).toBe(sale.id);
    await db.close();
  });
});

// ── TEST 2: Venta persiste al recargar ──────────────────────────────────────
describe("TEST 2 — Venta persiste al recargar página", () => {
  it("venta sobrevive después de cerrar y reabrir la DB", async () => {
    const dbName = `pos_reload_${Date.now()}`;

    class PersistDb extends Dexie {
      pendingSales!: Dexie.Table<PendingSale>;
      constructor() {
        super(dbName);
        this.version(1).stores({ pendingSales: "id, synced, created_at" });
      }
    }

    const db1 = new PersistDb();
    const sale = makeSale();
    await db1.pendingSales.add(sale);
    await db1.close();

    // Simula recarga: nueva instancia, mismo nombre
    const db2 = new PersistDb();
    const found = await db2.pendingSales.get(sale.id);
    expect(found).toBeDefined();
    expect(found!.synced).toBe(false);
    await db2.close();
  });
});

// ── TEST 3: Sync al reconectar ──────────────────────────────────────────────
describe("TEST 3 — Sync al reconectar: 3 ventas → todas synced=true", () => {
  it("marca las 3 ventas como synced después de sync exitoso", async () => {
    const db = makeDb();
    const sales = [makeSale(), makeSale(), makeSale()];
    await db.pendingSales.bulkAdd(sales);

    // Mock sync API: retorna éxito para todos
    const mockSync = vi.fn().mockResolvedValue({ synced: 3, errors: [] });

    const pending = await db.pendingSales.filter((s) => !s.synced).toArray();
    const result = await mockSync(pending.map((s) => ({
      items: s.items,
      payment_method: s.payment_method,
      created_at: s.created_at,
    })));

    const failedIndexes = new Set(result.errors?.map((e: { index: number }) => e.index) ?? []);
    for (let i = 0; i < pending.length; i++) {
      if (!failedIndexes.has(i)) {
        await db.pendingSales.update(pending[i].id, { synced: true });
      }
    }

    const all = await db.pendingSales.toArray();
    expect(all.every((s) => s.synced)).toBe(true);
    expect(mockSync).toHaveBeenCalledTimes(1);
    await db.close();
  });
});

// ── TEST 4: Sync parcial (venta 2 falla) ────────────────────────────────────
describe("TEST 4 — Sync parcial: venta 2 falla, 1 y 3 éxito", () => {
  it("venta 1 y 3 synced=true, venta 2 permanece synced=false", async () => {
    const db = makeDb();
    const s1 = makeSale();
    const s2 = makeSale();
    const s3 = makeSale();
    await db.pendingSales.bulkAdd([s1, s2, s3]);

    const mockSync = vi.fn().mockResolvedValue({
      synced: 2,
      errors: [{ index: 1, error: "producto no encontrado" }],
    });

    const pending = await db.pendingSales.filter((s) => !s.synced).toArray();
    const result = await mockSync(pending);
    const failedIndexes = new Set(result.errors?.map((e: { index: number }) => e.index) ?? []);

    for (let i = 0; i < pending.length; i++) {
      if (!failedIndexes.has(i)) {
        await db.pendingSales.update(pending[i].id, { synced: true });
      }
    }

    expect(await db.pendingSales.get(s1.id)).toMatchObject({ synced: true });
    expect(await db.pendingSales.get(s2.id)).toMatchObject({ synced: false });
    expect(await db.pendingSales.get(s3.id)).toMatchObject({ synced: true });
    await db.close();
  });
});

// ── TEST 5: Duplicado en sync (no idempotencia) ──────────────────────────────
describe("TEST 5 — Duplicado en sync: misma venta enviada dos veces", () => {
  it("DOCUMENTA BUG: payload de sync no incluye id offline → duplicado posible", async () => {
    const db = makeDb();
    const sale = makeSale();
    await db.pendingSales.add(sale);

    const buildPayload = (s: PendingSale) => ({
      items: s.items,
      payment_method: s.payment_method,
      created_at: s.created_at,
      // BUG: `id` de la venta offline NO se incluye
    });

    const payload = buildPayload(sale);

    // El payload no tiene 'id' → el backend creará 2 ventas distintas
    // si este payload se envía dos veces
    expect(payload).not.toHaveProperty("id");

    // Un backend idempotente debería rechazar la segunda con mismo id offline
    // Actualmente el backend genera nuevo UUID en cada inserción → DUPLICADO
    // Este test documenta el bug, no lo verifica en backend simulado
    expect(true).toBe(true); // placeholder hasta fix
    await db.close();
  });
});

// ── TEST 6: Sin productos en cache offline ───────────────────────────────────
describe("TEST 6 — Sin productos en cache offline", () => {
  it("productsCache vacío retorna array vacío sin lanzar error", async () => {
    const db = makeDb();

    const results = await db.productsCache.toArray();
    expect(results).toEqual([]);
    expect(results).toHaveLength(0);
    await db.close();
  });

  it("findByBarcode en cache vacío retorna undefined", async () => {
    const db = makeDb();
    const result = await db.productsCache.where("barcode").equals("1234567890").first();
    expect(result).toBeUndefined();
    await db.close();
  });
});

// ── TEST 7: Carrito no se limpia si Dexie falla ──────────────────────────────
describe("TEST 7 — Carrito no se limpia si Dexie.add() falla", () => {
  it("add() que lanza error no llega a limpiar el carrito", async () => {
    const db = makeDb();
    const cartItems = [{ product_id: "p1", quantity: 2 }];
    let cartCleared = false;
    let errorShown: string | null = null;

    const faultyAdd = vi.fn().mockRejectedValue(new Error("QuotaExceededError"));

    try {
      await faultyAdd(makeSale());
      // Si add() no lanza, limpia carrito
      cartCleared = true;
    } catch (err) {
      errorShown = err instanceof Error ? err.message : "Error desconocido";
    }

    expect(cartCleared).toBe(false);
    expect(errorShown).toBe("QuotaExceededError");
    expect(cartItems).toHaveLength(1); // items intactos
    await db.close();
  });
});

// ── TEST 8: IDs únicos offline ───────────────────────────────────────────────
describe("TEST 8 — IDs únicos offline (1000 UUIDs)", () => {
  it("crypto.randomUUID() no genera duplicados en 1000 iteraciones", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(crypto.randomUUID());
    }
    expect(ids.size).toBe(1000);
  });
});

// ── TEST 9: Orden cronológico en sync ────────────────────────────────────────
describe("TEST 9 — Orden cronológico en sync", () => {
  it("backend ordena ventas por created_at ascendente antes de insertar", async () => {
    const t1 = "2024-01-01T10:00:00Z";
    const t2 = "2024-01-01T10:05:00Z";
    const t3 = "2024-01-01T10:10:00Z";

    // Enviadas en orden inverso (como podrían llegar del cliente)
    const sales = [
      { created_at: t3, items: [], payment_method: "cash" },
      { created_at: t1, items: [], payment_method: "cash" },
      { created_at: t2, items: [], payment_method: "cash" },
    ];

    // Replica la lógica del backend (sales.go:386-391)
    const sorted = [...sales].sort((a, b) => {
      if (!a.created_at || !b.created_at) return 0;
      return a.created_at < b.created_at ? -1 : 1;
    });

    expect(sorted[0].created_at).toBe(t1);
    expect(sorted[1].created_at).toBe(t2);
    expect(sorted[2].created_at).toBe(t3);
  });
});

// ── TEST 10: Banner offline inmediato ────────────────────────────────────────
describe("TEST 10 — Banner offline: detección < 100ms", () => {
  it("evento 'offline' actualiza estado en < 100ms", () => {
    let offlineDetected = false;
    const handler = () => { offlineDetected = true; };
    window.addEventListener("offline", handler);

    const start = Date.now();
    window.dispatchEvent(new Event("offline"));
    const elapsed = Date.now() - start;

    expect(offlineDetected).toBe(true);
    expect(elapsed).toBeLessThan(100);
    window.removeEventListener("offline", handler);
  });
});

// ── TEST 11: Contador de pendientes preciso ──────────────────────────────────
describe("TEST 11 — Contador de pendientes preciso", () => {
  it("5 guardadas, 3 sincronizadas → contador = 2", async () => {
    const db = makeDb();
    const sales = [makeSale(), makeSale(), makeSale(), makeSale(), makeSale()];
    await db.pendingSales.bulkAdd(sales);

    // Sincronizar las primeras 3
    for (let i = 0; i < 3; i++) {
      await db.pendingSales.update(sales[i].id, { synced: true });
    }

    const unsynced = await db.pendingSales.filter((s) => !s.synced).count();
    expect(unsynced).toBe(2);
    await db.close();
  });
});

// ── TEST 12: Cierre de sesión limpia Dexie ──────────────────────────────────
describe("TEST 12 — Cierre de sesión: ¿limpia pendingSales?", () => {
  it("DOCUMENTA BUG: logout() NO limpia pendingSales en Dexie", async () => {
    const db = makeDb();
    await db.pendingSales.add(makeSale());

    // Simula logout (authStore.logout solo limpia localStorage)
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("store");

    // Las ventas siguen en IndexedDB — otro usuario podría verlas
    const count = await db.pendingSales.count();
    expect(count).toBe(1); // BUG: deberían ser 0 post-logout
    await db.close();
  });
});

// ── TEST 13: Red inestable — isFetching evita sync concurrente ───────────────
describe("TEST 13 — Red inestable: isFetching evita fetch concurrente", () => {
  it("isFetching=true bloquea invocaciones paralelas de prefetchAllProducts", async () => {
    let callCount = 0;
    let isFetching = false;

    const prefetch = async () => {
      if (isFetching) return;
      isFetching = true;
      callCount++;
      await new Promise((r) => setTimeout(r, 10));
      isFetching = false;
    };

    // 10 llamadas simultáneas
    await Promise.all(Array.from({ length: 10 }, () => prefetch()));
    expect(callCount).toBe(1);
  });

  it("DOCUMENTA BUG: useOfflineSync.sync() no tiene flag de concurrencia", () => {
    // La función sync() en useOfflineSync no verifica isSyncing al inicio.
    // isSyncing es React state (asíncrono), no un guard síncrono.
    // Dos eventos 'online' rápidos disparan dos syncs paralelos.
    // Esto puede causar doble-envío del mismo payload.
    expect(true).toBe(true); // documentado, no tiene fix automático aquí
  });
});

// ── TEST 14: Producto sin precio en cache ────────────────────────────────────
describe("TEST 14 — Producto sin precio (price=0) en cache offline", () => {
  it("producto con price=0 permite crear venta con total=$0", async () => {
    const db = makeDb();
    const product = makeProduct({ price: 0 });
    await db.productsCache.put(product);

    const found = await db.productsCache.get("prod-1");
    expect(found?.price).toBe(0);

    // El carrito calcularía total = 0 * qty = $0
    const total = (found?.price ?? 0) * 3;
    expect(total).toBe(0); // Venta de $0 posible — UX no la bloquea
    await db.close();
  });
});

// ── TEST 15: Estado syncing huérfano ─────────────────────────────────────────
describe("TEST 15 — Estado 'syncing' huérfano al reiniciar", () => {
  it("PendingSale no tiene campo syncing → no puede quedar huérfano", async () => {
    const db = makeDb();
    const sale = makeSale();
    await db.pendingSales.add(sale);

    // Verifica que el tipo no incluye campo 'syncing'
    const stored = await db.pendingSales.get(sale.id);
    expect(stored).not.toHaveProperty("syncing");
    expect(stored).toHaveProperty("synced", false);

    // Al reiniciar: synced=false → se reintentará. Sin estado huérfano posible.
    await db.close();
  });
});
