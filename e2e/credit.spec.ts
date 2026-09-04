/**
 * E2E — Fiado / Crédito (Credit page) T4.1–T4.9
 *
 * Pre-requisites:
 *   Backend running  → http://localhost:8080
 *   Frontend running → http://localhost:5173
 *   Owner account with at least plan:basico (credit feature)
 *
 * Run: npx playwright test e2e/credit.spec.ts
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { BASE, API, loginAsOwner, apiLogin } from './helpers/auth';
import { captureConsoleErrors } from './helpers/console';
import { parseMoneyText } from './helpers/money';

// ── Shared state ──────────────────────────────────────────────────────────────

let ownerToken    = '';
let customerId    = '';
let customerName  = '';

// ── API helpers ───────────────────────────────────────────────────────────────

async function createCustomerApi(
  request: APIRequestContext,
  token: string,
  name: string,
  phone = '5500000000',
): Promise<string> {
  const res = await request.post(`${API}/api/v1/credit`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, phone, credit_limit: 5000 },
  });
  if (!res.ok()) throw new Error(`createCustomerApi failed: ${await res.text()}`);
  const { data } = await res.json() as { data: { id: string } };
  return data.id;
}

async function chargeCustomerApi(
  request: APIRequestContext,
  token: string,
  id: string,
  amount: number,
): Promise<void> {
  const res = await request.post(`${API}/api/v1/credit/${id}/charge`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { amount, description: 'E2E Test charge' },
  });
  if (!res.ok()) throw new Error(`chargeCustomerApi failed: ${await res.text()}`);
}

async function payCustomerApi(
  request: APIRequestContext,
  token: string,
  id: string,
  amount: number,
  paymentMethod: 'cash' | 'card' | 'transfer' = 'cash',
): Promise<void> {
  const res = await request.post(`${API}/api/v1/credit/${id}/pay`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { amount, payment_method: paymentMethod },
  });
  if (!res.ok()) throw new Error(`payCustomerApi failed: ${await res.text()}`);
}

async function getCustomerBalanceApi(
  request: APIRequestContext,
  token: string,
  id: string,
): Promise<number> {
  const res = await request.get(`${API}/api/v1/credit`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return 0;
  const { data } = await res.json() as { data: Array<{ id: string; balance: number }> };
  return data?.find((c) => c.id === id)?.balance ?? 0;
}

async function deleteCustomerApi(
  request: APIRequestContext,
  token: string,
  id: string,
): Promise<void> {
  await request.delete(`${API}/api/v1/credit/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── UI helpers ────────────────────────────────────────────────────────────────

async function gotoCredit(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`${BASE}/credit`);
  await page.waitForLoadState('networkidle');
  // Wait for either the customer list or the empty state
  await expect(
    page.locator('h1').filter({ hasText: /Fiado/ }),
  ).toBeVisible({ timeout: 10_000 });
}

/** Find the card for a given customer by name and return its locator. */
function getCustomerCard(page: import('@playwright/test').Page, name: string) {
  return page
    .locator('[class*="rounded"]')
    .filter({ hasText: name })
    .first();
}

/** Click "Pago" for a given customer. */
async function clickPayButton(
  page: import('@playwright/test').Page,
  name: string,
): Promise<void> {
  const card = getCustomerCard(page, name);
  await card.getByRole('button', { name: /Pago/ }).click();
}

/** Click "Fiado" for a given customer. */
async function clickChargeButton(
  page: import('@playwright/test').Page,
  name: string,
): Promise<void> {
  const card = getCustomerCard(page, name);
  await card.getByRole('button', { name: /Fiado/ }).click();
}

/** Click the "⋮" (MoreVertical) options button for a given customer. */
async function clickOptionsButton(
  page: import('@playwright/test').Page,
  name: string,
): Promise<void> {
  const card = getCustomerCard(page, name);
  // The options button has a MoreVertical icon inside, no text — find it by position
  const buttons = card.getByRole('button');
  // Last button in the row of 3 action buttons is the "⋮" button
  await buttons.last().click();
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────

test.beforeAll(async ({ request }) => {
  ownerToken = await apiLogin(request);

  const ts = Date.now();
  customerName = `E2E FIADO TEST ${ts}`;

  customerId = await createCustomerApi(request, ownerToken, customerName);
});

test.afterAll(async ({ request }) => {
  if (!customerId) return;
  // Zero out balance before deleting
  const balance = await getCustomerBalanceApi(request, ownerToken, customerId);
  if (balance > 0) {
    await payCustomerApi(request, ownerToken, customerId, balance, 'cash').catch(() => {});
  }
  await deleteCustomerApi(request, ownerToken, customerId);
});

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe.serial('T4 — Fiado / Crédito', () => {

  // ── T4.1 — La página carga y muestra el cliente de prueba ────────────────

  test('T4.1 — La página /credit carga y muestra "Fiado digital" con el cliente creado', async ({ page }) => {
    const errors = captureConsoleErrors(page);

    await loginAsOwner(page);
    await gotoCredit(page);

    // Header
    await expect(page.locator('h1').filter({ hasText: /Fiado/ })).toBeVisible();

    // "+ Cliente" button
    await expect(page.getByRole('button', { name: '+ Cliente' })).toBeVisible();

    // The test customer should appear in the list
    await expect(page.getByText(customerName)).toBeVisible({ timeout: 8_000 });

    // No console errors
    expect(errors, `Console errors: ${errors.join('\n')}`).toHaveLength(0);
  });

  // ── T4.2 — Crear nuevo cliente via UI ────────────────────────────────────

  test('T4.2 — Crear nuevo cliente via "+ Cliente" aparece en la lista', async ({ page }) => {
    const newName = `E2E NUEVO ${Date.now()}`;

    await loginAsOwner(page);
    await gotoCredit(page);

    // Open modal
    await page.getByRole('button', { name: '+ Cliente' }).click();
    await expect(page.getByText('Nuevo cliente')).toBeVisible({ timeout: 5_000 });

    // Fill name and phone
    await page.locator('input[placeholder="Nombre (Apellido opcional)"]').fill(newName);
    await page.locator('input[type="tel"]').last().fill('5591234567');

    // Submit — button text is "Agregar cliente"
    await page.getByRole('button', { name: 'Agregar cliente' }).click();

    // Modal closes, customer appears in list
    await expect(page.getByText('Nuevo cliente')).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(newName)).toBeVisible({ timeout: 8_000 });

    // Cleanup: delete the newly created customer via API
    const listRes = await page.request.get(`${API}/api/v1/credit`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    if (listRes.ok()) {
      const { data } = await listRes.json() as { data: Array<{ id: string; customer_name: string; balance: number }> };
      const created = data?.find((c) => c.customer_name === newName);
      if (created) {
        await page.request.delete(`${API}/api/v1/credit/${created.id}`, {
          headers: { Authorization: `Bearer ${ownerToken}` },
        });
      }
    }
  });

  // ── T4.3 — Agregar fiado via UI ───────────────────────────────────────────

  test('T4.3 — Agregar fiado via UI actualiza el saldo del cliente', async ({ page, request }) => {
    // Ensure balance is 0 before this test
    const balanceBefore = await getCustomerBalanceApi(request, ownerToken, customerId);
    if (balanceBefore > 0) {
      await payCustomerApi(request, ownerToken, customerId, balanceBefore, 'cash');
    }

    await loginAsOwner(page);
    await gotoCredit(page);
    await expect(page.getByText(customerName)).toBeVisible({ timeout: 8_000 });

    // Click "Fiado" button on the customer card
    await clickChargeButton(page, customerName);

    // Modal "Agregar fiado" opens
    await expect(page.getByText('Agregar fiado')).toBeVisible({ timeout: 5_000 });

    // Enter amount
    await page.locator('input[type="number"]').first().fill('120');

    // Optional description
    await page.locator('input[placeholder="Ej. 2 Cocas, 1 pan..."]').fill('Prueba E2E');

    // Submit — button text "Agregar fiado"
    await page.getByRole('button', { name: 'Agregar fiado' }).click();

    // Modal closes
    await expect(page.getByText('Agregar fiado')).not.toBeVisible({ timeout: 5_000 });

    // Customer balance should now show $120.00
    const card = getCustomerCard(page, customerName);
    await expect(card.getByText('120.00')).toBeVisible({ timeout: 8_000 });

    // Cleanup balance
    await payCustomerApi(request, ownerToken, customerId, 120, 'cash').catch(() => {});
  });

  // ── T4.4 — Registrar pago via UI ──────────────────────────────────────────

  test('T4.4 — Registrar pago via UI reduce el saldo del cliente', async ({ page, request }) => {
    // Set up: charge $200 so there's something to pay
    const balance = await getCustomerBalanceApi(request, ownerToken, customerId);
    if (balance < 200) {
      await chargeCustomerApi(request, ownerToken, customerId, 200 - balance);
    }

    await loginAsOwner(page);
    await gotoCredit(page);
    await expect(page.getByText(customerName)).toBeVisible({ timeout: 8_000 });

    // Click "Pago" button
    await clickPayButton(page, customerName);

    // Modal "Registrar pago" opens
    await expect(page.getByText('Registrar pago')).toBeVisible({ timeout: 5_000 });

    // Enter amount $100
    await page.locator('input[type="number"]').first().fill('100');

    // Verify payment method tabs are visible
    await expect(page.getByText('Efectivo')).toBeVisible();
    await expect(page.getByText('Tarjeta')).toBeVisible();
    await expect(page.getByText('Transferencia')).toBeVisible();

    // Leave default "Efectivo" selected
    // Submit
    await page.getByRole('button', { name: 'Confirmar pago' }).click();

    // Modal closes
    await expect(page.getByText('Registrar pago')).not.toBeVisible({ timeout: 5_000 });

    // Balance reduced — should show $100.00 now (200 - 100)
    const card = getCustomerCard(page, customerName);
    await expect(card.getByText('100.00')).toBeVisible({ timeout: 8_000 });

    // Cleanup
    await payCustomerApi(request, ownerToken, customerId, 100, 'cash').catch(() => {});
  });

  // ── T4.5 — Sobrepago: pagar más de lo adeudado ───────────────────────────

  test('T4.5 — Sobrepago: intentar pagar más del saldo muestra advertencia o deshabilita confirmación', async ({ page, request }) => {
    // Set up: charge $100
    const balance = await getCustomerBalanceApi(request, ownerToken, customerId);
    if (balance < 100) {
      await chargeCustomerApi(request, ownerToken, customerId, 100 - balance);
    } else if (balance > 100) {
      // Bring down to 100
      await payCustomerApi(request, ownerToken, customerId, balance - 100, 'cash').catch(() => {});
    }

    await loginAsOwner(page);
    await gotoCredit(page);
    await expect(page.getByText(customerName)).toBeVisible({ timeout: 8_000 });

    // Click "Pago"
    await clickPayButton(page, customerName);
    await expect(page.getByText('Registrar pago')).toBeVisible({ timeout: 5_000 });

    // Try to pay $200 (double the debt)
    await page.locator('input[type="number"]').first().fill('200');

    // Soft assertion: either a warning message appears OR the confirm button is disabled
    const confirmBtn = page.getByRole('button', { name: 'Confirmar pago' });
    const isDisabled = await confirmBtn.isDisabled();
    const warningVisible = await page.getByText(/excede la deuda/).isVisible().catch(() => false);

    // The UI must prevent the overpayment in some form
    expect(
      isDisabled || warningVisible,
      `Expected either button disabled (${isDisabled}) or warning visible (${warningVisible}) when overpaying`,
    ).toBeTruthy();

    // Close the modal
    await page.keyboard.press('Escape');
    await expect(page.getByText('Registrar pago')).not.toBeVisible({ timeout: 3_000 });

    // Cleanup
    const remaining = await getCustomerBalanceApi(request, ownerToken, customerId);
    if (remaining > 0) {
      await payCustomerApi(request, ownerToken, customerId, remaining, 'cash').catch(() => {});
    }
  });

  // ── T4.6 — Editar nombre del cliente via ⋮ ───────────────────────────────

  test('T4.6 — Editar nombre del cliente via ⋮ → "Editar cliente"', async ({ page }) => {
    const updatedName = `${customerName} EDIT`;

    await loginAsOwner(page);
    await gotoCredit(page);
    await expect(page.getByText(customerName)).toBeVisible({ timeout: 8_000 });

    // Click ⋮ options button
    await clickOptionsButton(page, customerName);

    // Options sheet opens with customer name as title
    await expect(page.getByText('Editar cliente')).toBeVisible({ timeout: 5_000 });

    // Click "Editar cliente"
    await page.getByRole('button', { name: 'Editar cliente' }).click();

    // Edit modal opens
    await expect(page.getByText('Editar cliente')).toBeVisible({ timeout: 5_000 });

    // Clear name field and type new name
    const nameInput = page.locator('input').first();
    await nameInput.clear();
    await nameInput.fill(updatedName);

    // Save
    await page.getByRole('button', { name: 'Guardar' }).click();

    // Modal closes, updated name appears
    await expect(page.getByText('Editar cliente')).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 8_000 });

    // Restore original name via API for subsequent tests
    const listRes = await page.request.get(`${API}/api/v1/credit`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    if (listRes.ok()) {
      const { data } = await listRes.json() as { data: Array<{ id: string; customer_name: string }> };
      const found = data?.find((c) => c.customer_name === updatedName);
      if (found) {
        await page.request.put(`${API}/api/v1/credit/${found.id}`, {
          headers: { Authorization: `Bearer ${ownerToken}` },
          data: { customer_name: customerName },
        });
      }
    }
  });

  // ── T4.7 — Eliminar cliente con saldo no es posible ───────────────────────

  test('T4.7 — Intentar eliminar cliente con saldo muestra advertencia "No puedes eliminar"', async ({ page, request }) => {
    // Ensure customer has a balance
    const balance = await getCustomerBalanceApi(request, ownerToken, customerId);
    if (balance === 0) {
      await chargeCustomerApi(request, ownerToken, customerId, 50);
    }

    await loginAsOwner(page);
    await gotoCredit(page);
    await expect(page.getByText(customerName)).toBeVisible({ timeout: 8_000 });

    // Click ⋮ options button
    await clickOptionsButton(page, customerName);

    // Options sheet opens
    await expect(page.getByText(/Editar cliente/)).toBeVisible({ timeout: 5_000 });

    // When balance > 0, the delete button should NOT appear; instead a warning should show
    // Per the source: if balance > 0, shows AlertCircle + "No puedes eliminar un cliente con deuda"
    await expect(
      page.getByText('No puedes eliminar un cliente con deuda. Registra el pago completo primero.'),
    ).toBeVisible({ timeout: 5_000 });

    // The destructive "Eliminar cliente" button should NOT be present (replaced by warning div)
    await expect(
      page.getByRole('button', { name: 'Eliminar cliente' }),
    ).not.toBeVisible();

    // Close sheet
    await page.getByRole('button', { name: 'Cancelar' }).click();

    // Cleanup
    const remaining = await getCustomerBalanceApi(request, ownerToken, customerId);
    if (remaining > 0) {
      await payCustomerApi(request, ownerToken, customerId, remaining, 'cash').catch(() => {});
    }
  });

  // ── T4.8 — Eliminar cliente con saldo $0 via ⋮ → confirmación → eliminado ─

  test('T4.8 — Eliminar cliente con saldo $0 muestra diálogo de confirmación y elimina', async ({ page, request }) => {
    // Create a disposable customer for this test
    const disposableName = `E2E DELETE ${Date.now()}`;
    const disposableId = await createCustomerApi(request, ownerToken, disposableName);

    await loginAsOwner(page);
    await gotoCredit(page);
    await expect(page.getByText(disposableName)).toBeVisible({ timeout: 8_000 });

    // Click ⋮
    await clickOptionsButton(page, disposableName);
    await expect(page.getByText(/Editar cliente/)).toBeVisible({ timeout: 5_000 });

    // "Eliminar cliente" button should be visible (balance = 0)
    const deleteBtn = page.getByRole('button', { name: 'Eliminar cliente' });
    await expect(deleteBtn).toBeVisible();

    // Handle the confirm() dialog — auto-accept
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain(disposableName);
      dialog.accept();
    });

    await deleteBtn.click();

    // Customer should disappear from the list
    await expect(page.getByText(disposableName)).not.toBeVisible({ timeout: 8_000 });

    // Cleanup in case the delete dialog was not handled properly
    await deleteCustomerApi(request, ownerToken, disposableId).catch(() => {});
  });

  // ── T4.9 — Búsqueda de clientes filtra la lista ──────────────────────────

  test('T4.9 — El campo de búsqueda filtra clientes por nombre', async ({ page, request }) => {
    // Create a second customer with a distinct name for this test
    const uniqueName = `E2E BUSCAR ${Date.now()}`;
    const uniqueId = await createCustomerApi(request, ownerToken, uniqueName);

    await loginAsOwner(page);
    await gotoCredit(page);

    // Both customers should initially be visible (or at least the unique one)
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 8_000 });

    // Type a search term that matches only the unique customer
    // The search input uppercases text (onChange uses toUpperCase)
    const searchInput = page.locator('input[placeholder="Buscar cliente..."]');
    await searchInput.fill('BUSCAR');

    // Wait for the list to filter (query refetches with search param)
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // uniqueName should still be visible
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 5_000 });

    // The main test customer (customerName starts with "E2E FIADO TEST") should NOT be visible
    await expect(page.getByText(customerName)).not.toBeVisible({ timeout: 3_000 });

    // Clear search → both appear again
    await searchInput.clear();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(customerName)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(uniqueName)).toBeVisible();

    // Cleanup
    await deleteCustomerApi(request, ownerToken, uniqueId).catch(() => {});
  });

});
