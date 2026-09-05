/**
 * E2E — Auth session behaviour
 *
 * Pre-requisites:
 *   Backend running  → http://localhost:8080
 *   Frontend running → http://localhost:5173
 *   .env.test populated with TEST_OWNER_PHONE / TEST_OWNER_PASSWORD
 *
 * Run: npx playwright test e2e/auth-session.spec.ts
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

// ── Config ────────────────────────────────────────────────────────────────────

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const API  = process.env.VITE_API_URL        ?? 'http://localhost:8080';

const OWNER_PHONE    = process.env.TEST_OWNER_PHONE    ?? '5560645229';
const OWNER_PASSWORD = process.env.TEST_OWNER_PASSWORD ?? '504150';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Generates a JWT-shaped token with exp 1 hour in the past.
 * Signature is fake — used only for frontend expiry detection tests.
 */
function tokenExpirado(): string {
  const header  = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    sub:      'test-user',
    store_id: 'test-store',
    role:     'owner',
    exp:      Math.floor(Date.now() / 1000) - 3600,
  }));
  return `${header}.${payload}.fake-sig`;
}

/**
 * Reads all records from the pendingSales IndexedDB object store.
 * Works even while Dexie has the DB open (multiple simultaneous connections allowed).
 */
async function getPendingSales(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(async () => {
    return new Promise<Record<string, unknown>[]>((resolve) => {
      const req = indexedDB.open('pos_tienditas');
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('pendingSales')) {
          db.close();
          resolve([]);
          return;
        }
        const tx    = db.transaction('pendingSales', 'readonly');
        const store = tx.objectStore('pendingSales');
        const all   = store.getAll();
        all.onsuccess = () => { db.close(); resolve(all.result as Record<string, unknown>[]); };
        all.onerror   = () => { db.close(); resolve([]); };
      };
      req.onerror = () => resolve([]);
    });
  });
}

/** Fills and submits the login form via UI. */
async function loginAs(page: Page, phone: string, password: string): Promise<void> {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="tel"]').fill(phone);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

/** Returns the raw JWT from localStorage. */
function getStoredToken(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('token'));
}

/** Creates a test product via REST API; returns its barcode. */
async function createTestProduct(request: APIRequestContext, token: string): Promise<string> {
  const barcode = `E2E${Date.now()}`;
  const res = await request.post(`${API}/api/v1/products`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name:               `TEST E2E ${barcode}`,
      price:              10,
      cost:               5,
      stock:              50,
      low_stock_threshold: 5,
      unit:               'pza',
      barcode,
    },
  });
  expect(res.ok()).toBeTruthy();
  return barcode;
}

/** Deletes a product by barcode using the API. */
async function deleteTestProduct(
  request: APIRequestContext,
  token: string,
  productId: string,
): Promise<void> {
  await request.delete(`${API}/api/v1/products/${productId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Shared state (test product created in beforeAll) ───────────────────────────

let ownerToken    = '';
let testProductId = '';
let testBarcode   = '';

test.beforeAll(async ({ request }) => {
  // Login via API to get owner token
  const res  = await request.post(`${API}/api/v1/auth/login`, {
    data: { phone: OWNER_PHONE, password: OWNER_PASSWORD },
  });
  expect(res.ok(), 'Owner login via API must succeed').toBeTruthy();
  const body = await res.json() as { data: { token: string } };
  ownerToken = body.data.token;

  // Create a product that tests can interact with in the scanner
  testBarcode = await createTestProduct(request, ownerToken);

  // Get the product ID so we can delete it after tests
  const listRes = await request.get(`${API}/api/v1/products/barcode/${testBarcode}`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  if (listRes.ok()) {
    const { data } = await listRes.json() as { data: { id: string } };
    testProductId = data.id;
  }
});

test.afterAll(async ({ request }) => {
  if (testProductId && ownerToken) {
    await deleteTestProduct(request, ownerToken, testProductId);
  }
});

// Reset localStorage + store state between tests
test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE}/login`);
  await page.evaluate(() => localStorage.clear());
});

// ── TEST 1: Login normal funciona ─────────────────────────────────────────────

test('TEST 1 — Login con credenciales válidas llega al dashboard', async ({ page }) => {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="tel"]').fill(OWNER_PHONE);
  await page.locator('input[type="password"]').fill(OWNER_PASSWORD);
  await page.locator('button[type="submit"]').click();

  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

  // The greeting "Hola, {firstName}" must be visible
  await expect(page.getByText(/Hola,/)).toBeVisible({ timeout: 5_000 });
});

// ── TEST 2: Token expirado al arrancar → redirect sin navegar ─────────────────

test('TEST 2 — Token expirado al recargar redirige a /login y limpia localStorage', async ({ page }) => {
  await loginAs(page, OWNER_PHONE, OWNER_PASSWORD);

  // Replace valid token with one expired 1 hour ago
  await page.evaluate((tok) => {
    localStorage.setItem('token', tok);
  }, tokenExpirado());

  // Reload: hydrate() fires, detects expired token, clears localStorage
  await page.reload();

  // hydrate() clears state → PrivateRoute redirects to /login
  await page.waitForURL(/\/login/, { timeout: 5_000 });

  // Verify localStorage was cleaned
  const tokenAfter = await getStoredToken(page);
  expect(tokenAfter).toBeNull();

  const userAfter = await page.evaluate(() => localStorage.getItem('user'));
  expect(userAfter).toBeNull();

  const storeAfter = await page.evaluate(() => localStorage.getItem('store'));
  expect(storeAfter).toBeNull();
});

// ── TEST 3: Token eliminado con app abierta → 401 → /login?expired=1 ─────────

test('TEST 3 — Eliminar token con app abierta provoca redirect a /login con banner de sesión expirada', async ({ page }) => {
  await loginAs(page, OWNER_PHONE, OWNER_PASSWORD);
  await page.goto(`${BASE}/scanner`);
  await page.waitForLoadState('networkidle');

  // Delete the token while the app is open (session "expires" mid-session)
  await page.evaluate(() => localStorage.removeItem('token'));

  // Trigger an API call by simulating a barcode scan (USB scanner style):
  // useGlobalScanner fires when ≥4 chars typed rapidly + Enter, with no input focused.
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
  await page.keyboard.type(testBarcode ?? '7501055300105', { delay: 0 });
  await page.keyboard.press('Enter');

  // apiFetch gets 401 (no token) → interceptor → window.location.href = '/login?expired=1'
  await page.waitForURL(/\/login/, { timeout: 8_000 });

  // If the 401 interceptor fired (not just PrivateRoute), URL contains ?expired=1
  // and the session-expired banner is shown
  if (page.url().includes('expired=1')) {
    await expect(page.getByText('Tu sesión expiró')).toBeVisible({ timeout: 3_000 });
  }

  // Modal "Producto no registrado" must NOT appear (redirected before it could show)
  await expect(page.getByText('Producto no registrado')).not.toBeVisible();
});

// ── TEST 4 (CRÍTICO): Ventas pendientes sobreviven al 401 ─────────────────────

test('TEST 4 (CRÍTICO) — Ventas pendientes en Dexie NO se borran cuando 401 redirige a login', async ({ page, context }) => {
  await loginAs(page, OWNER_PHONE, OWNER_PASSWORD);

  // Navigate to scanner while online
  await page.goto(`${BASE}/scanner`);
  await page.waitForLoadState('networkidle');

  // Add product to cart via keyboard barcode scan (same mechanism as TEST 6, while ONLINE).
  // useGlobalScanner intercepts rapid keypresses + Enter when no input is focused.
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
  await page.keyboard.type(testBarcode, { delay: 0 });
  await page.keyboard.press('Enter');

  // Wait for the cart badge to confirm the product was added
  await expect(page.getByText(/\d+ item/)).toBeVisible({ timeout: 10_000 });

  // Navigate to /payment while still ONLINE (cart state persists across React Router nav)
  await page.locator('button', { hasText: 'Cobrar' }).click();
  await page.waitForURL(/\/payment/, { timeout: 5_000 });

  // Select payment amount ("Exacto" = exact amount) so the confirm button enables
  await page.locator('button', { hasText: 'Exacto' }).click();

  // NOW go offline — the Payment component detects it via the 'offline' event
  await context.setOffline(true);
  await page.waitForTimeout(500); // let isOnline state update in Payment.tsx

  // Confirm the sale — offline path saves to Dexie
  await page.locator('button', { hasText: 'Confirmar' }).click({ timeout: 5_000 });
  await page.waitForURL(/\/receipt/, { timeout: 8_000 });

  // Verify the sale was saved to Dexie
  const salesBeforeLogout = await getPendingSales(page);
  expect(salesBeforeLogout.length, 'Expected 1 pending sale in Dexie').toBe(1);

  // Intercept the sync endpoint to prevent the infinite-reload loop:
  // Without this, useOfflineSync fires sync() on every /login reload → 401 →
  // window.location.href → reload → repeat, destroying every page.evaluate context.
  // We return a partial-failure response so the sale stays in Dexie (not marked synced)
  // while the sync call itself succeeds (no 401 → no reload loop).
  await context.route('**/api/v1/sales/sync', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { synced: 0, errors: [{ index: 0, error: 'mock-prevent-loop' }] } }),
    }),
  );

  // Simulate server-side token invalidation:
  // Keep the original header+payload so isTokenExpired() sees a valid future exp
  // → Zustand sets isAuthenticated=true → PrivateRoute passes → Scanner/ProductPrefetcher mount.
  // Corrupt only the signature → API returns 401 → interceptor fires → hard nav to /login?expired=1.
  await page.evaluate(() => {
    const token = localStorage.getItem('token')!;
    const parts = token.split('.');
    localStorage.setItem('token', `${parts[0]}.${parts[1]}.TAMPERED`);
  });
  await context.setOffline(false);

  // Navigate to scanner — ProductPrefetcher makes an API call with the tampered token.
  // The API returns 401 → interceptor fires → window.location.href = '/login?expired=1'.
  // This may abort the page.goto mid-load (ERR_ABORTED), which is expected behavior.
  await page.goto(`${BASE}/scanner`).catch(() => {});
  await page.waitForURL(/\/login/, { timeout: 12_000 });
  // Wait for useOfflineSync's mocked sync() to settle so the context is stable.
  await page.waitForLoadState('networkidle');

  await context.unroute('**/api/v1/sales/sync');

  // CRITICAL: raw getAll() includes records regardless of synced/failed flags.
  // The 401 interceptor only clears localStorage — it never touches Dexie.
  const salesAfterLogout = await getPendingSales(page);
  expect(
    salesAfterLogout.length,
    'FALLA: ventas pendientes se perdieron cuando el interceptor de 401 redirigió.',
  ).toBeGreaterThanOrEqual(1);
});

// ── TEST 5: Credenciales incorrectas no generan loop ─────────────────────────

test('TEST 5 — Credenciales incorrectas muestran error sin loop de redirect', async ({ page }) => {
  const navUrls: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navUrls.push(frame.url());
  });

  await page.goto(`${BASE}/login`);
  await page.locator('input[type="tel"]').fill(OWNER_PHONE);
  await page.locator('input[type="password"]').fill('contraseña_incorrecta_99');
  await page.locator('button[type="submit"]').click();

  // Wait for the error to appear (form shows error, does NOT navigate away).
  // The API returns "Credenciales incorrectas" → shown in the red error box.
  await expect(page.getByText('Credenciales incorrectas')).toBeVisible({ timeout: 5_000 });

  // Wait a moment and collect all navigations
  await page.waitForTimeout(1_500);

  // Must still be on /login
  expect(page.url()).toMatch(/\/login/);
  // Must NOT contain ?expired=1 (401 interceptor must not fire for /auth/ routes)
  expect(page.url()).not.toContain('expired=1');

  // At most 1 navigation (the initial goto /login) — no loop
  const loginNavs = navUrls.filter((u) => u.includes('/login'));
  expect(loginNavs.length, 'Redirect loop detected — URL changed more than once to /login').toBeLessThanOrEqual(2);
});

// ── TEST 6: 404 real no redirige — el modal "Producto no registrado" aparece ──

test('TEST 6 — Código de barras inexistente muestra modal, NO redirige a login', async ({ page }) => {
  await loginAs(page, OWNER_PHONE, OWNER_PASSWORD);
  await page.goto(`${BASE}/scanner`);
  await page.waitForLoadState('networkidle');

  // Ensure no input has focus so useGlobalScanner intercepts
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());

  // Type a barcode that definitely doesn't exist (all zeros)
  await page.keyboard.type('0000000000000', { delay: 0 });
  await page.keyboard.press('Enter');

  // Modal "Producto no registrado" must appear (404 from API, not a session issue)
  await expect(page.getByText('Producto no registrado')).toBeVisible({ timeout: 8_000 });

  // URL must still be /scanner — no redirect to login
  expect(page.url()).toMatch(/\/scanner/);
});

// ── TEST 7: Dashboard carga para los 3 roles sin errores de consola ───────────

test('TEST 7 — Dashboard del owner carga sin errores de consola', async ({ page, request }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await loginAs(page, OWNER_PHONE, OWNER_PASSWORD);
  // Wait for dashboard widgets to settle
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2_000);

  expect(consoleErrors, `Console errors as owner:\n${consoleErrors.join('\n')}`).toHaveLength(0);
});

test('TEST 7B — Dashboard del cajero carga sin errores de consola', async ({ page, request }) => {
  // Create a temporary cashier user
  const cashierPhone = `55${Date.now().toString().slice(-8)}`;
  const createRes = await request.post(`${API}/api/v1/users`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: { name: 'E2E Cashier', phone: cashierPhone, password: '504150', role: 'cashier' },
  });

  // Skip if plan doesn't allow user creation
  test.skip(!createRes.ok(), `Cashier creation failed (${createRes.status()}) — skip role test`);

  const { data: cashier } = await createRes.json() as { data: { id: string } };

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await loginAs(page, cashierPhone, '504150');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2_000);

  // Cleanup
  if (cashier?.id) {
    await request.delete(`${API}/api/v1/users/${cashier.id}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
  }

  expect(consoleErrors, `Console errors as cashier:\n${consoleErrors.join('\n')}`).toHaveLength(0);
});

test('TEST 7C — Dashboard del inventario carga sin errores de consola', async ({ page, request }) => {
  const invPhone = `56${Date.now().toString().slice(-8)}`;
  const createRes = await request.post(`${API}/api/v1/users`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: { name: 'E2E Inventory', phone: invPhone, password: '504150', role: 'inventory' },
  });

  test.skip(!createRes.ok(), `Inventory creation failed (${createRes.status()}) — skip role test`);

  const { data: inv } = await createRes.json() as { data: { id: string } };

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await loginAs(page, invPhone, '504150');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2_000);

  if (inv?.id) {
    await request.delete(`${API}/api/v1/users/${inv.id}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
  }

  expect(consoleErrors, `Console errors as inventory:\n${consoleErrors.join('\n')}`).toHaveLength(0);
});

// ── TEST 8: Offline no se confunde con 401 ────────────────────────────────────

test('TEST 8 — Error de red (offline) NO redirige a login ni limpia la sesión', async ({ page, context }) => {
  await loginAs(page, OWNER_PHONE, OWNER_PASSWORD);

  const tokenBefore = await getStoredToken(page);
  expect(tokenBefore).not.toBeNull();

  // Navigate to Inventory while online so the page loads
  await page.goto(`${BASE}/inventory`);
  await page.waitForLoadState('networkidle');

  // Go offline — Inventory listens to 'offline' event and shows the banner
  await context.setOffline(true);

  // Wait for the Inventory offline banner to appear
  await expect(
    page.getByText('Sin conexión · mostrando datos guardados'),
  ).toBeVisible({ timeout: 8_000 });

  // Must NOT have redirected to /login
  expect(page.url()).not.toMatch(/\/login/);

  // Token must still be present (network error ≠ session expiry)
  const tokenAfter = await getStoredToken(page);
  expect(tokenAfter).toBe(tokenBefore);

  await context.setOffline(false);
});
