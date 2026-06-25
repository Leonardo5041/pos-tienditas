import "fake-indexeddb/auto";
import { afterEach } from "vitest";
import { indexedDB } from "fake-indexeddb";

// Reset IndexedDB between tests by deleting all databases
afterEach(async () => {
  const dbs = await indexedDB.databases?.() ?? [];
  for (const db of dbs) {
    if (db.name) indexedDB.deleteDatabase(db.name);
  }
});
