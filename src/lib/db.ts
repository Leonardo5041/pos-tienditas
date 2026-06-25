import Dexie, { type Table } from "dexie";
import type { PendingSale } from "../types/sale";
import type { PendingProductOp } from "../types/pending-product";
import type { Product } from "../types/product";

class PosDatabase extends Dexie {
  pendingSales!: Table<PendingSale>;
  pendingProducts!: Table<PendingProductOp>;
  productsCache!: Table<Product>;

  constructor() {
    super("pos_tienditas");
    this.version(1).stores({
      pendingSales: "id, synced, created_at",
    });
    this.version(2).stores({
      pendingSales: "id, synced, created_at",
      pendingProducts: "id, synced, created_at",
    });
    this.version(3).stores({
      pendingSales: "id, synced, created_at",
      pendingProducts: "id, synced, created_at",
      productsCache: "id, name, barcode",
    });
  }
}

export const db = new PosDatabase();
export const posDb = db;

const MAX_RETRIES = 3;

export const pendingSalesDb = {
  add: (sale: PendingSale) => db.pendingSales.add(sale),
  getUnsynced: () => db.pendingSales.filter((s) => !s.synced && !s.failed).toArray(),
  markSynced: (id: string) => db.pendingSales.update(id, { synced: true }),
  incrementRetry: async (id: string, currentRetries: number) => {
    const next = currentRetries + 1;
    if (next >= MAX_RETRIES) {
      await db.pendingSales.update(id, { retries: next, failed: true });
    } else {
      await db.pendingSales.update(id, { retries: next });
    }
  },
  resetFailed: (id: string) => db.pendingSales.update(id, { failed: false, retries: 0 }),
  resetAllFailed: async () => {
    const failed = await db.pendingSales.filter((s) => !!s.failed).toArray();
    await Promise.all(failed.map((s) => db.pendingSales.update(s.id, { failed: false, retries: 0 })));
  },
  countFailed: () => db.pendingSales.filter((s) => !!s.failed).count(),
  count: () => db.pendingSales.filter((s) => !s.synced && !s.failed).count(),
};

export const pendingProductsDb = {
  add: (op: PendingProductOp) => db.pendingProducts.add(op),
  getUnsynced: () =>
    db.pendingProducts.filter((op) => !op.synced).sortBy("created_at"),
  markSynced: (id: string) => db.pendingProducts.update(id, { synced: true }),
  count: () => db.pendingProducts.filter((op) => !op.synced).count(),
};
