# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-session.spec.ts >> TEST 4 (CRÍTICO) — Ventas pendientes en Dexie NO se borran cuando 401 redirige a login
- Location: e2e/auth-session.spec.ts:221:1

# Error details

```
Error: page.evaluate: Execution context was destroyed, most likely because of a navigation
```

# Test source

```ts
  1   | /**
  2   |  * E2E — Auth session behaviour
  3   |  *
  4   |  * Pre-requisites:
  5   |  *   Backend running  → http://localhost:8080
  6   |  *   Frontend running → http://localhost:5173
  7   |  *   .env.test populated with TEST_OWNER_PHONE / TEST_OWNER_PASSWORD
  8   |  *
  9   |  * Run: npx playwright test e2e/auth-session.spec.ts
  10  |  */
  11  | 
  12  | import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
  13  | 
  14  | // ── Config ────────────────────────────────────────────────────────────────────
  15  | 
  16  | const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
  17  | const API  = process.env.VITE_API_URL        ?? 'http://localhost:8080';
  18  | 
  19  | const OWNER_PHONE    = process.env.TEST_OWNER_PHONE    ?? '5560645229';
  20  | const OWNER_PASSWORD = process.env.TEST_OWNER_PASSWORD ?? '504150';
  21  | 
  22  | // ── Helpers ───────────────────────────────────────────────────────────────────
  23  | 
  24  | /**
  25  |  * Generates a JWT-shaped token with exp 1 hour in the past.
  26  |  * Signature is fake — used only for frontend expiry detection tests.
  27  |  */
  28  | function tokenExpirado(): string {
  29  |   const header  = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  30  |   const payload = btoa(JSON.stringify({
  31  |     sub:      'test-user',
  32  |     store_id: 'test-store',
  33  |     role:     'owner',
  34  |     exp:      Math.floor(Date.now() / 1000) - 3600,
  35  |   }));
  36  |   return `${header}.${payload}.fake-sig`;
  37  | }
  38  | 
  39  | /**
  40  |  * Reads all records from the pendingSales IndexedDB object store.
  41  |  * Works even while Dexie has the DB open (multiple simultaneous connections allowed).
  42  |  */
  43  | async function getPendingSales(page: Page): Promise<Record<string, unknown>[]> {
> 44  |   return page.evaluate(async () => {
      |               ^ Error: page.evaluate: Execution context was destroyed, most likely because of a navigation
  45  |     return new Promise<Record<string, unknown>[]>((resolve) => {
  46  |       const req = indexedDB.open('pos_tienditas');
  47  |       req.onsuccess = () => {
  48  |         const db = req.result;
  49  |         if (!db.objectStoreNames.contains('pendingSales')) {
  50  |           db.close();
  51  |           resolve([]);
  52  |           return;
  53  |         }
  54  |         const tx    = db.transaction('pendingSales', 'readonly');
  55  |         const store = tx.objectStore('pendingSales');
  56  |         const all   = store.getAll();
  57  |         all.onsuccess = () => { db.close(); resolve(all.result as Record<string, unknown>[]); };
  58  |         all.onerror   = () => { db.close(); resolve([]); };
  59  |       };
  60  |       req.onerror = () => resolve([]);
  61  |     });
  62  |   });
  63  | }
  64  | 
  65  | /** Fills and submits the login form via UI. */
  66  | async function loginAs(page: Page, phone: string, password: string): Promise<void> {
  67  |   await page.goto(`${BASE}/login`);
  68  |   await page.locator('input[type="tel"]').fill(phone);
  69  |   await page.locator('input[type="password"]').fill(password);
  70  |   await page.locator('button[type="submit"]').click();
  71  |   await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  72  | }
  73  | 
  74  | /** Returns the raw JWT from localStorage. */
  75  | function getStoredToken(page: Page): Promise<string | null> {
  76  |   return page.evaluate(() => localStorage.getItem('token'));
  77  | }
  78  | 
  79  | /** Creates a test product via REST API; returns its barcode. */
  80  | async function createTestProduct(request: APIRequestContext, token: string): Promise<string> {
  81  |   const barcode = `E2E${Date.now()}`;
  82  |   const res = await request.post(`${API}/api/v1/products`, {
  83  |     headers: { Authorization: `Bearer ${token}` },
  84  |     data: {
  85  |       name:               `TEST E2E ${barcode}`,
  86  |       price:              10,
  87  |       cost:               5,
  88  |       stock:              50,
  89  |       low_stock_threshold: 5,
  90  |       unit:               'pza',
  91  |       barcode,
  92  |     },
  93  |   });
  94  |   expect(res.ok()).toBeTruthy();
  95  |   return barcode;
  96  | }
  97  | 
  98  | /** Deletes a product by barcode using the API. */
  99  | async function deleteTestProduct(
  100 |   request: APIRequestContext,
  101 |   token: string,
  102 |   productId: string,
  103 | ): Promise<void> {
  104 |   await request.delete(`${API}/api/v1/products/${productId}`, {
  105 |     headers: { Authorization: `Bearer ${token}` },
  106 |   });
  107 | }
  108 | 
  109 | // ── Shared state (test product created in beforeAll) ───────────────────────────
  110 | 
  111 | let ownerToken    = '';
  112 | let testProductId = '';
  113 | let testBarcode   = '';
  114 | 
  115 | test.beforeAll(async ({ request }) => {
  116 |   // Login via API to get owner token
  117 |   const res  = await request.post(`${API}/api/v1/auth/login`, {
  118 |     data: { phone: OWNER_PHONE, password: OWNER_PASSWORD },
  119 |   });
  120 |   expect(res.ok(), 'Owner login via API must succeed').toBeTruthy();
  121 |   const body = await res.json() as { data: { token: string } };
  122 |   ownerToken = body.data.token;
  123 | 
  124 |   // Create a product that tests can interact with in the scanner
  125 |   testBarcode = await createTestProduct(request, ownerToken);
  126 | 
  127 |   // Get the product ID so we can delete it after tests
  128 |   const listRes = await request.get(`${API}/api/v1/products/barcode/${testBarcode}`, {
  129 |     headers: { Authorization: `Bearer ${ownerToken}` },
  130 |   });
  131 |   if (listRes.ok()) {
  132 |     const { data } = await listRes.json() as { data: { id: string } };
  133 |     testProductId = data.id;
  134 |   }
  135 | });
  136 | 
  137 | test.afterAll(async ({ request }) => {
  138 |   if (testProductId && ownerToken) {
  139 |     await deleteTestProduct(request, ownerToken, testProductId);
  140 |   }
  141 | });
  142 | 
  143 | // Reset localStorage + store state between tests
  144 | test.beforeEach(async ({ page }) => {
```