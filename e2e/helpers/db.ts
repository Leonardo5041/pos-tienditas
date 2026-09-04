import { type Page } from '@playwright/test';

const DB_NAME = 'pos_tienditas';

async function getAllFromStore(page: Page, storeName: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(
    ({ db, store }: { db: string; store: string }) =>
      new Promise<Record<string, unknown>[]>((resolve) => {
        const req = indexedDB.open(db);
        req.onsuccess = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains(store)) { d.close(); resolve([]); return; }
          const tx  = d.transaction(store, 'readonly');
          const s   = tx.objectStore(store);
          const all = s.getAll();
          all.onsuccess = () => { d.close(); resolve(all.result as Record<string, unknown>[]); };
          all.onerror   = () => { d.close(); resolve([]); };
        };
        req.onerror = () => resolve([]);
      }),
    { db: DB_NAME, store: storeName },
  );
}

export const getPendingSales  = (page: Page) => getAllFromStore(page, 'pendingSales');
export const getProductsCache = (page: Page) => getAllFromStore(page, 'productsCache');

export async function clearIndexedDB(page: Page): Promise<void> {
  await page.evaluate(
    (db: string) =>
      new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(db);
        req.onsuccess = () => resolve();
        req.onerror   = () => resolve();
        req.onblocked = () => resolve();
      }),
    DB_NAME,
  );
}
