/**
 * Tests para el nuevo comportamiento de autenticación:
 *   - isTokenExpired: base64url correcto, clock skew, malformados
 *   - hydrate(): limpia localStorage en token expirado
 *   - apiFetch: interceptor 401, 404, offline/TypeError
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuthStore } from "@/stores/authStore";
import { apiFetch, ApiError } from "@/lib/api";

// ── Helpers ──────────────────────────────────────────────────────────────────

function b64url(str: string): string {
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeJWT(payload: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body   = b64url(JSON.stringify(payload));
  return `${header}.${body}.fakesig`;
}

const nowSec = () => Math.floor(Date.now() / 1000);

function validToken(ttlSeconds = 86400 * 30): string {
  return makeJWT({ exp: nowSec() + ttlSeconds, sub: "u1", store_id: "s1", role: "owner" });
}

function expiredToken(expiredSecondsAgo = 3600): string {
  return makeJWT({ exp: nowSec() - expiredSecondsAgo, sub: "u1", store_id: "s1", role: "owner" });
}

const DUMMY_USER  = JSON.stringify({ id: "u1", name: "Test", role: "owner" });
const DUMMY_STORE = JSON.stringify({
  id: "s1", name: "Tienda", slug: "tienda", plan: "basico",
  effective_plan: "basico", is_on_trial: false,
  trial_days_left: 0, trial_ends_at: null, has_access: true,
});

function seedLocalStorage(token: string) {
  localStorage.setItem("token", token);
  localStorage.setItem("user",  DUMMY_USER);
  localStorage.setItem("store", DUMMY_STORE);
}

function resetAuthStore() {
  useAuthStore.setState({ token: null, user: null, store: null, isAuthenticated: false });
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetAuthStore();
  localStorage.clear();
  vi.restoreAllMocks();
});

// ── TEST 6: isTokenExpired — token válido → hydrate establece isAuthenticated=true ──

describe("TEST 6 — token válido no está expirado", () => {
  it("hydrate() con token de 30 días → isAuthenticated true", () => {
    seedLocalStorage(validToken(86400 * 30));
    useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});

// ── TEST 7: isTokenExpired — token vencido → hydrate limpia todo ─────────────

describe("TEST 7 — token expirado es detectado", () => {
  it("hydrate() con token expirado hace 1h → isAuthenticated false", () => {
    seedLocalStorage(expiredToken(3600));
    useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

// ── TEST 8: isTokenExpired — token malformado → true, sin throw ──────────────

describe("TEST 8 — token malformado tratado como expirado, sin excepción", () => {
  it.each([
    ["solo texto", "not-a-jwt"],
    ["dos segmentos", "header.payload"],
    ["payload vacío", "eyJhbGciOiJIUzI1NiJ9..fakesig"],
    ["JSON inválido en payload", `eyJhbGciOiJIUzI1NiJ9.${b64url("not-json")}.sig`],
  ])("%s → isAuthenticated false, no lanza", (_label, tok) => {
    seedLocalStorage(tok);
    expect(() => useAuthStore.getState().hydrate()).not.toThrow();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

// ── TEST 9: isTokenExpired — null/string vacío → false, sin throw ────────────

describe("TEST 9 — localStorage sin token → isAuthenticated false", () => {
  it("sin token en localStorage → isAuthenticated false", () => {
    // No seedLocalStorage — token is null
    useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("token vacío en localStorage → isAuthenticated false", () => {
    localStorage.setItem("token", "");
    localStorage.setItem("user",  DUMMY_USER);
    localStorage.setItem("store", DUMMY_STORE);
    expect(() => useAuthStore.getState().hydrate()).not.toThrow();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

// ── TEST 10: isTokenExpired — JWT con base64url (- y _) decodifica correcto ──

describe("TEST 10 — JWT con caracteres base64url (- y _) se decodifica correctamente", () => {
  it("payload con '-' en base64url → token válido reconocido, isAuthenticated true", () => {
    // btoa(JSON.stringify({exp:9999999999,"k":">"})) = "eyJleHAiOjk5OTk5OTk5OTksImsiOiI+In0="
    // base64url version contains '-': "eyJleHAiOjk5OTk5OTk5OTksImsiOiI-In0"
    // This verifies that atob() normalization handles the '-' char without throwing.
    const payloadB64url = btoa(JSON.stringify({ exp: 9999999999, k: ">" }))
      .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

    // Verify the segment actually contains '-' or '_' (sanity check)
    expect(payloadB64url.includes("-") || payloadB64url.includes("_")).toBe(true);

    const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const tok = `${header}.${payloadB64url}.fakesig`;

    seedLocalStorage(tok);
    expect(() => useAuthStore.getState().hydrate()).not.toThrow();
    // exp = 9999999999 (year 2286) — not expired
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});

// ── TEST 11: hydrate() con token expirado → localStorage limpio ──────────────

describe("TEST 11 — hydrate() con token expirado limpia localStorage", () => {
  it("token vencido → token/user/store removidos de localStorage", () => {
    seedLocalStorage(expiredToken(7200));
    useAuthStore.getState().hydrate();

    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
    expect(localStorage.getItem("store")).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().token).toBeNull();
  });
});

// ── TEST 12: hydrate() con token válido → isAuthenticated true ───────────────

describe("TEST 12 — hydrate() con token válido restaura sesión", () => {
  it("token+user+store presentes y válidos → isAuthenticated true, datos cargados", () => {
    const tok = validToken(86400 * 30);
    seedLocalStorage(tok);
    useAuthStore.getState().hydrate();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe(tok);
    expect(state.user?.id).toBe("u1");
    expect(state.store?.id).toBe("s1");
  });
});

// ── TEST 13: apiFetch 401 (ruta protegida) → ApiError status 401 ─────────────

describe("TEST 13 — apiFetch con 401 lanza ApiError(401)", () => {
  it("respuesta 401 de ruta protegida → ApiError con status 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Token inválido o expirado" }),
    } as Response);

    localStorage.setItem("token", validToken());

    await expect(apiFetch("/api/v1/products")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
    });
  });

  it("respuesta 401 limpia localStorage", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "expired" }),
    } as Response);

    seedLocalStorage(validToken());

    try { await apiFetch("/api/v1/products"); } catch { /* expected */ }

    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
    expect(localStorage.getItem("store")).toBeNull();
  });
});

// ── TEST 14: apiFetch 404 → ApiError status 404, NO redirige ────────────────

describe("TEST 14 — apiFetch 404 lanza ApiError(404) sin redirigir", () => {
  it("respuesta 404 → ApiError con status 404 (no 401, no redirect)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: "Producto no encontrado" }),
    } as Response);

    const tokenBefore = "valid-token-should-stay";
    localStorage.setItem("token", tokenBefore);

    let caught: unknown;
    try { await apiFetch("/api/v1/products/barcode/9999"); } catch (e) { caught = e; }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(404);
    // localStorage should NOT be cleared (404 is not a session issue)
    expect(localStorage.getItem("token")).toBe(tokenBefore);
  });
});

// ── TEST 15: apiFetch offline (TypeError) → no trata como 401, no redirige ──

describe("TEST 15 — fallo de red NO se trata como 401", () => {
  it("TypeError de fetch (offline) → propaga TypeError, no ApiError, no limpia session", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const tokenBefore = "token-should-survive-offline";
    localStorage.setItem("token", tokenBefore);

    let caught: unknown;
    try { await apiFetch("/api/v1/products"); } catch (e) { caught = e; }

    // Must NOT be ApiError — it's a network error
    expect(caught).toBeInstanceOf(TypeError);
    expect(caught).not.toBeInstanceOf(ApiError);
    // Session must survive
    expect(localStorage.getItem("token")).toBe(tokenBefore);
  });
});

// ── TEST extra: interceptor 401 NO aplica en rutas /auth/* ───────────────────

describe("TEST extra — interceptor 401 excluye rutas /api/v1/auth/*", () => {
  it("401 en /auth/login → lanza ApiError(401) pero NO limpia localStorage", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Credenciales incorrectas" }),
    } as Response);

    seedLocalStorage(validToken());

    let caught: unknown;
    try { await apiFetch("/api/v1/auth/login", { method: "POST", body: JSON.stringify({}) }); } catch (e) { caught = e; }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(401);
    expect((caught as ApiError).message).toBe("Credenciales incorrectas");
    // localStorage should NOT be cleared (auth route 401 = wrong credentials, not expired session)
    expect(localStorage.getItem("token")).not.toBeNull();
  });
});
