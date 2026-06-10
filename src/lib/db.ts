import Dexie, { type Table } from "dexie";
import type { PendingSale } from "../types/sale";
import type { PendingProductOp } from "../types/pending-product";

class PosDatabase extends Dexie {
  pendingSales!: Table<PendingSale>;
  pendingProducts!: Table<PendingProductOp>;

  constructor() {
    super("pos_tienditas");
    this.version(1).stores({
      pendingSales: "id, synced, created_at",
    });
    this.version(2).stores({
      pendingSales: "id, synced, created_at",
      pendingProducts: "id, synced, created_at",
    });
  }
}

export const db = new PosDatabase();

export const pendingSalesDb = {
  add: (sale: PendingSale) => db.pendingSales.add(sale),
  getUnsynced: () => db.pendingSales.filter((s) => !s.synced).toArray(),
  markSynced: (id: string) => db.pendingSales.update(id, { synced: true }),
  count: () => db.pendingSales.filter((s) => !s.synced).count(),
};

export const pendingProductsDb = {
  add: (op: PendingProductOp) => db.pendingProducts.add(op),
  getUnsynced: () =>
    db.pendingProducts.filter((op) => !op.synced).sortBy("created_at"),
  markSynced: (id: string) => db.pendingProducts.update(id, { synced: true }),
  count: () => db.pendingProducts.filter((op) => !op.synced).count(),
};
