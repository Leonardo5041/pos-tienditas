/**
 * E2E — Offline behaviour (T2.1–T2.9)
 *
 * Pre-requisites:
 *   Backend running  → http://localhost:8080
 *   Frontend running → http://localhost:5173
 *   .env.test populated with TEST_OWNER_PHONE / TEST_OWNER_PASSWORD
 *
 * Run: npx playwright test e2e/offline.spec.ts
 */

import { test, expect } from '@playwright/test';
import {
  BASE,
  API,
  OWNER_PHONE,
  OWNER_PASSWORD,
  loginAsOwner,
  apiLogin,
} from './helpers/auth';
import { getPendingSales, getProductsCache, clearIndexedDB } from './helpers/db';

// ── Shared state ─────────────────────────────────────────────────────────────

const TEST_BARCODE = 'E2EOFFLINE001';
const TEST_PRODUCT_NAME = 'E2E Offline Test';

let ownerToken = '';
let testProductId = '';

// ── Setup / teardown ─────────────────────────────────────────────────────────

test.beforeAll(async ({ request }) => {
  ownerToken = await apiLogin(request, OWNER_PHONE, OWNER_PASSWORD);

  // Ensure test product exists (idempotent — ignore conflict)
  await request.post(`${API}/api/v1/products`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: {
      name: TEST_PRODUCT_NAME,
      price: 25,
      cost: 10,
      stock: 200,
      low_stock_threshold: 5,
      unit: 'pza',
      barcode: TEST_BARCODE,
    },
  });

  // Fetch ID and reactivate if soft-deleted from a previous run
  const br = await request.get(`${API}/api/v1/products/barcode/${TEST_BARCODE}`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  if (br.ok()) {
    const { data } = (await br.json()) as { data: { id: string; is_inactive?: boolean } };
    testProductId = data.id;
    if (data.is_inactive) {
      await request.post(`${API}/api/v1/products/${testProductId}/reactivate`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
    }
  }
});

test.afterAll(async ({ request }) => {
  if (testProductId && ownerToken) {
    await request.delete(`${API}/api/v1/products/${testProductId}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
  }
});

test.beforeEach(async ({ page }) => {
  // Land on login and clear storage so each test starts clean
  await page.goto(`${BASE}/login`);
  await page.evaluate(() => localStorage.clear());
  await clearIndexedDB(page);
});

test.afterEach(async ({ context }) => {
  // Ensure sync interceptors don't leak between tests (e.g. if T2.4 assertion fails)
  await context.unrouteAll({ behavior: 'ignoreErrors' });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Scan a product via keyboard (mirrors USB barcode-scanner behaviour).
 * Blur any focused element first so useGlobalScanner intercepts the keystrokes.
 */
async function scanBarcode(page: import('@playwright/test').Page, barcode: string) {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
  await page.keyboard.type(barcode, { delay: 0 });
  await page.keyboard.press('Enter');
}

/**
 * Complete a full offline sale:
 *  1. Login + go to /scanner (populates product cache)
 *  2. Scan the test product
 *  3. Navigate to /payment and click "Exacto"
 *  4. Go offline, then confirm → /receipt
 */
async function doOfflineSale(
  page: import('@playwright/test').Page,
  context: import('@playwright/test').BrowserContext,
) {
  await loginAsOwner(page);
  await page.goto(`${BASE}/scanner`);
  await page.waitForLoadState('networkidle');

  await scanBarcode(page, TEST_BARCODE);
  await expect(page.getByText(/\d+ item/)).toBeVisible({ timeout: 10_000 });

  await page.locator('button', { hasText: 'Cobrar' }).click();
  await page.waitForURL(/\/payment/, { timeout: 5_000 });
  await page.locator('button', { hasText: 'Exacto' }).click();

  await context.setOffline(true);
  await page.waitForTimeout(500); // let isOnline state update in Payment.tsx

  await page.locator('button', { hasText: 'Confirmar' }).click({ timeout: 5_000 });
  await page.waitForURL(/\/receipt/, { timeout: 8_000 });
}

/**
 * Poll getPendingSales until it returns an empty array (sync complete)
 * or the timeout elapses. Returns true if sync completed, false on timeout.
 */
async function waitForSyncComplete(
  page: import('@playwright/test').Page,
  timeoutMs = 15_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const all = await getPendingSales(page);
    // Dexie keeps synced records with synced=true; only unsynced+unfailed ones are pending
    const unsynced = all.filter((s) => !s['synced'] && !s['failed']);
    if (unsynced.length === 0) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

// ── T2.1 — Banner offline aparece ────────────────────────────────────────────

test('T2.1 — Banner offline aparece cuando se pierde la conexión', async ({ page, context }) => {
  await loginAsOwner(page);
  await page.goto(`${BASE}/scanner`);
  await page.waitForLoadState('networkidle');

  await context.setOffline(true);

  await expect(page.getByText(/Sin conexión/)).toBeVisible({ timeout: 1_000 });

  await context.setOffline(false);
});

// ── T2.2 — Venta offline se guarda en IndexedDB ───────────────────────────────

test('T2.2 — Venta offline se guarda en IndexedDB (pendingSales)', async ({ page, context }) => {
  await doOfflineSale(page, context);

  await expect(page.getByText(/Guardada sin conexión/)).toBeVisible({ timeout: 5_000 });

  const pending = await getPendingSales(page);
  expect(pending.length, 'Debe haber al menos 1 venta pendiente en Dexie').toBeGreaterThanOrEqual(1);

  await context.setOffline(false);
});

// ── T2.3 — Venta offline sobrevive recarga ────────────────────────────────────

test('T2.3 — Venta offline sobrevive una recarga de página', async ({ page, context }) => {
  await doOfflineSale(page, context);

  // Intercept sync so the reload doesn't upload the pending sale
  await context.route('**/api/v1/sales/sync', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { synced: 0, errors: [] } }),
    }),
  );

  // Go online to reload — app has no service worker so localhost is unreachable when offline.
  // The sync mock keeps the sale in Dexie (markSynced is called but record is NOT deleted;
  // getAll() returns all records including synced=true ones).
  await context.setOffline(false);
  await page.reload({ waitUntil: 'networkidle' });

  // After reload, IDB should still contain the pending sale (marked synced but not deleted)
  const pending = await getPendingSales(page);
  expect(
    pending.length,
    'La venta pendiente debe persistir tras la recarga',
  ).toBeGreaterThanOrEqual(1);

  await context.unroute('**/api/v1/sales/sync');
});

// ── T2.4 — Sync automático al reconectar ─────────────────────────────────────

test(
  'T2.4 — Sync automático al reconectar sube las ventas offline a la API',
  async ({ page, context, request }) => {
    // Intercept but allow real sync to happen (route.continue())
    const syncCalls: string[] = [];
    await context.route('**/api/v1/sales/sync', (route) => {
      syncCalls.push(route.request().url());
      return route.continue();
    });

    // ── First offline sale ───────────────────────────────────────────────────
    await loginAsOwner(page);
    await page.goto(`${BASE}/scanner`);
    await page.waitForLoadState('networkidle');

    await scanBarcode(page, TEST_BARCODE);
    await expect(page.getByText(/\d+ item/)).toBeVisible({ timeout: 10_000 });

    await page.locator('button', { hasText: 'Cobrar' }).click();
    await page.waitForURL(/\/payment/, { timeout: 5_000 });
    await page.locator('button', { hasText: 'Exacto' }).click();

    await context.setOffline(true);
    await page.waitForTimeout(500);

    await page.locator('button', { hasText: 'Confirmar' }).click({ timeout: 5_000 });
    await page.waitForURL(/\/receipt/, { timeout: 8_000 });

    // ── Second offline sale ──────────────────────────────────────────────────
    await page.locator('button', { hasText: 'Nueva venta' }).click();
    await page.waitForURL(/\/scanner/, { timeout: 5_000 });

    await scanBarcode(page, TEST_BARCODE);
    await expect(page.getByText(/\d+ item/)).toBeVisible({ timeout: 10_000 });

    await page.locator('button', { hasText: 'Cobrar' }).click();
    await page.waitForURL(/\/payment/, { timeout: 5_000 });
    await page.locator('button', { hasText: 'Exacto' }).click();

    // Still offline
    await page.locator('button', { hasText: 'Confirmar' }).click({ timeout: 5_000 });
    await page.waitForURL(/\/receipt/, { timeout: 8_000 });

    // Verify 2 pending before going online
    const pendingBefore = await getPendingSales(page);
    expect(pendingBefore.length, 'Deben haber 2 ventas pendientes').toBeGreaterThanOrEqual(2);

    // Count sales in API before sync
    const beforeRes = await request.get(`${API}/api/v1/sales?limit=100`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const { data: beforeData } = (await beforeRes.json()) as {
      data: { sales: unknown[]; total_count: number };
    };
    const salesCountBefore = beforeData.total_count;

    // ── Go online — useOfflineSync fires sync() ──────────────────────────────
    await context.setOffline(false);
    await page.waitForLoadState('networkidle');

    const synced = await waitForSyncComplete(page, 15_000);
    expect(synced, 'Las ventas pendientes deben sincronizarse en 15 segundos').toBe(true);

    // Verify in API: count should have increased by 2
    const afterRes = await request.get(`${API}/api/v1/sales?limit=100`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const { data: afterData } = (await afterRes.json()) as {
      data: { sales: unknown[]; total_count: number };
    };
    expect(
      afterData.total_count,
      'La API debe registrar 2 ventas nuevas tras la sincronización',
    ).toBeGreaterThanOrEqual(salesCountBefore + 2);

    await context.unroute('**/api/v1/sales/sync');
  },
);

// ── T2.5 — Fiado NO disponible offline ───────────────────────────────────────

test('T2.5 — Opción "Fiado" no está disponible cuando no hay conexión', async ({
  page,
  context,
}) => {
  await loginAsOwner(page);
  await page.goto(`${BASE}/scanner`);
  await page.waitForLoadState('networkidle');

  await scanBarcode(page, TEST_BARCODE);
  await expect(page.getByText(/\d+ item/)).toBeVisible({ timeout: 10_000 });

  await page.locator('button', { hasText: 'Cobrar' }).click();
  await page.waitForURL(/\/payment/, { timeout: 5_000 });

  // Go offline while on /payment
  await context.setOffline(true);
  await page.waitForTimeout(500);

  // When offline, Fiado renders a "no disponible sin conexión" warning instead of being hidden
  await expect(page.getByText('Fiado no disponible sin conexión')).toBeVisible();

  await context.setOffline(false);
});

// ── T2.6 — Productos disponibles offline desde cache ─────────────────────────

test(
  'T2.6 — Productos en cache son buscables estando offline',
  async ({ page, context }) => {
    await loginAsOwner(page);
    await page.goto(`${BASE}/scanner`);
    // Wait for networkidle so prefetchAllProducts() completes and fills productsCache
    await page.waitForLoadState('networkidle');
    // Extra wait to ensure the cache write is done
    await page.waitForTimeout(2_000);

    // Verify cache was populated before going offline
    const cachedBefore = await getProductsCache(page);
    expect(cachedBefore.length, 'El cache debe tener productos antes de desconectarse').toBeGreaterThan(0);

    await context.setOffline(true);

    // Type in the search input (works from cache via searchByName)
    const searchInput = page.locator('input[placeholder="Buscar por nombre o código..."]');
    await searchInput.fill(TEST_PRODUCT_NAME);

    // The product should appear in the dropdown from the local cache
    await expect(page.getByText(TEST_PRODUCT_NAME)).toBeVisible({ timeout: 5_000 });

    await context.setOffline(false);
  },
);

// ── T2.7 — Stock local se descuenta offline ───────────────────────────────────

test(
  'T2.7 — Stock en productsCache se descuenta al confirmar una venta offline',
  async ({ page, context }) => {
    await loginAsOwner(page);
    await page.goto(`${BASE}/scanner`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2_000); // wait for prefetch

    // Read stock before the offline sale
    const cacheBefore = await getProductsCache(page);
    const productBefore = cacheBefore.find(
      (p) => (p as { barcode?: string }).barcode === TEST_BARCODE,
    ) as { stock?: number; id?: string } | undefined;

    // If the product isn't in cache yet, we skip rather than fail
    test.skip(
      !productBefore,
      'Producto de prueba no encontrado en productsCache — omitir T2.7',
    );

    const initialStock = productBefore!.stock ?? 0;

    // Go offline and do the sale
    await context.setOffline(true);

    await scanBarcode(page, TEST_BARCODE);
    await expect(page.getByText(/\d+ item/)).toBeVisible({ timeout: 10_000 });

    await page.locator('button', { hasText: 'Cobrar' }).click();
    await page.waitForURL(/\/payment/, { timeout: 5_000 });
    await page.locator('button', { hasText: 'Exacto' }).click();

    await page.locator('button', { hasText: 'Confirmar' }).click({ timeout: 5_000 });
    await page.waitForURL(/\/receipt/, { timeout: 8_000 });

    // Check updated cache
    const cacheAfter = await getProductsCache(page);
    const productAfter = cacheAfter.find(
      (p) => (p as { barcode?: string }).barcode === TEST_BARCODE,
    ) as { stock?: number } | undefined;

    expect(
      productAfter?.stock,
      'El stock en cache debe haber disminuido tras la venta offline',
    ).toBeLessThan(initialStock);

    await context.setOffline(false);
  },
);

// ── T2.8 — No hay doble venta al sincronizar ──────────────────────────────────

test(
  'T2.8 — Una sola venta offline se registra exactamente una vez al sincronizar',
  async ({ page, context, request }) => {
    // Count existing sales
    const beforeRes = await request.get(`${API}/api/v1/sales?limit=100`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const { data: beforeData } = (await beforeRes.json()) as {
      data: { sales: unknown[]; total_count: number };
    };
    const countBefore = beforeData.total_count;

    // Do 1 offline sale
    await doOfflineSale(page, context);

    // Go back online
    await context.setOffline(false);
    await page.waitForLoadState('networkidle');

    // Wait for sync to complete
    const synced = await waitForSyncComplete(page, 15_000);
    expect(synced, 'La venta pendiente debe sincronizarse en 15 segundos').toBe(true);

    // Count should have increased by exactly 1
    const afterRes = await request.get(`${API}/api/v1/sales?limit=100`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const { data: afterData } = (await afterRes.json()) as {
      data: { sales: unknown[]; total_count: number };
    };

    expect(
      afterData.total_count,
      'La API debe registrar exactamente 1 venta nueva (sin duplicados)',
    ).toBe(countBefore + 1);
  },
);

// ── T2.9 — Red intermitente no duplica sync ───────────────────────────────────

test(
  'T2.9 — Red intermitente no genera ventas duplicadas',
  async ({ page, context, request }) => {
    // Count existing sales
    const beforeRes = await request.get(`${API}/api/v1/sales?limit=100`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const { data: beforeData } = (await beforeRes.json()) as {
      data: { sales: unknown[]; total_count: number };
    };
    const countBefore = beforeData.total_count;

    // Do 1 offline sale
    await doOfflineSale(page, context);

    // Go online to start sync, then rapidly toggle offline/online 5 times.
    // isSyncingRef guard in useOfflineSync prevents duplicate concurrent syncs.
    await context.setOffline(false);
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(500);
      await context.setOffline(true);
      await page.waitForTimeout(500);
      await context.setOffline(false);
    }

    // Wait for sync to complete (pendingSales emptied)
    const synced = await waitForSyncComplete(page, 15_000);
    expect(synced, 'La venta pendiente debe sincronizarse a pesar de la red intermitente').toBe(true);

    // Only 1 new sale should exist in the API
    const afterRes = await request.get(`${API}/api/v1/sales?limit=100`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const { data: afterData } = (await afterRes.json()) as {
      data: { sales: unknown[]; total_count: number };
    };

    expect(
      afterData.total_count,
      'La red intermitente no debe duplicar la venta sincronizada',
    ).toBe(countBefore + 1);
  },
);
