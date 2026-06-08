import Dexie, { type Table } from "dexie";
import type { PendingSale } from "../types/sale";

class PosDatabase extends Dexie {
  pendingSales!: Table<PendingSale>;

  constructor() {
    super("pos_tienditas");
    this.version(1).stores({
      pendingSales: "id, synced, created_at",
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
