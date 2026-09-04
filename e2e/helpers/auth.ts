import { type Page, type APIRequestContext } from '@playwright/test';

export const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
export const API  = (process.env.VITE_API_URL ?? 'http://localhost:8080').replace(/\/$/, '');

export const OWNER_PHONE    = process.env.TEST_OWNER_PHONE    ?? '5560645229';
export const OWNER_PASSWORD = process.env.TEST_OWNER_PASSWORD ?? '504150';

export async function loginAsOwner(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="tel"]').fill(OWNER_PHONE);
  await page.locator('input[type="password"]').fill(OWNER_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

export async function loginAs(page: Page, phone: string, password: string): Promise<void> {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="tel"]').fill(phone);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

export async function apiLogin(
  request: APIRequestContext,
  phone = OWNER_PHONE,
  password = OWNER_PASSWORD,
): Promise<string> {
  const res  = await request.post(`${API}/api/v1/auth/login`, { data: { phone, password } });
  const body = await res.json() as { data: { token: string } };
  return body.data.token;
}

export function tokenExpirado(): string {
  const header  = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    sub: 'test-user', store_id: 'test-store', role: 'owner',
    exp: Math.floor(Date.now() / 1000) - 3600,
  }));
  return `${header}.${payload}.fake-sig`;
}
