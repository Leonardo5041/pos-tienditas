import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { useAuthStore, type LoginResponse } from "@/stores/authStore";

export default function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuthStore();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch<LoginResponse>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ phone, password }),
      });
      login(data);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#0f0f0f] flex flex-col items-center justify-center px-5 py-10"
      style={{ fontFamily: "DM Sans, system-ui, sans-serif" }}
    >
      <div className="mb-10 text-center">
        <div
          className="w-20 h-20 rounded-full mx-auto mb-5 flex items-center justify-center"
          style={{
            background: "rgba(0,229,160,0.1)",
            border: "1.5px solid rgba(0,229,160,0.25)",
          }}
        >
          <span className="text-4xl">🏪</span>
        </div>
        <h1 className="text-3xl font-bold text-[#f0f0f0] tracking-tight">Mi Tiendita</h1>
        <p className="mt-1.5 text-sm text-[#666]">Punto de venta para tienditas</p>
      </div>

      <div
        className="w-full max-w-sm bg-[#1a1a1a]"
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "20px",
          padding: "28px 24px",
        }}
      >
        <h2 className="text-lg font-semibold text-[#f0f0f0] mb-1">Bienvenido de vuelta</h2>
        <p className="text-sm text-[#666] mb-6">Ingresa a tu tienda</p>

        {new URLSearchParams(window.location.search).get("expired") && (
          <div
            style={{
              background: "rgba(255,159,67,0.1)",
              border: "1px solid rgba(255,159,67,0.2)",
              borderRadius: "10px",
              padding: "12px 16px",
              marginBottom: "16px",
              fontSize: "13px",
              color: "#ff9f43",
              textAlign: "center",
            }}
          >
            Tu sesión expiró. Vuelve a entrar para continuar.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label className="block text-xs font-semibold text-[#999] uppercase tracking-wider mb-2">
            Teléfono
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            placeholder="55 1234 5678"
            className="w-full h-12 rounded-[10px] bg-[#242424] px-4 text-base text-[#f0f0f0] placeholder:text-[#555] focus:outline-none transition"
            style={{
              border: "1px solid rgba(255,255,255,0.08)",
              fontFamily: "DM Sans, system-ui, sans-serif",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "#00e5a0";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0,229,160,0.1)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />

          <label className="block text-xs font-semibold text-[#999] uppercase tracking-wider mb-2 mt-4">
            Contraseña
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Tu contraseña"
              className="w-full h-12 rounded-[10px] bg-[#242424] px-4 pr-12 text-base text-[#f0f0f0] placeholder:text-[#555] focus:outline-none transition"
              style={{
                border: "1px solid rgba(255,255,255,0.08)",
                fontFamily: "DM Sans, system-ui, sans-serif",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#00e5a0";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0,229,160,0.1)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666] hover:text-[#999] transition-colors"
              tabIndex={-1}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>

          {error && (
            <div
              className="mt-3 px-4 py-2.5 rounded-[10px] text-sm text-[#ff6b6b]"
              style={{
                background: "rgba(255,107,107,0.1)",
                border: "1px solid rgba(255,107,107,0.2)",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full h-12 rounded-[10px] bg-[#00e5a0] text-black font-bold text-base transition-opacity"
            style={{
              opacity: loading ? 0.7 : 1,
              fontFamily: "DM Sans, system-ui, sans-serif",
            }}
          >
            {loading ? "Iniciando..." : "Iniciar sesión"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-[#666]">
          <Link to="/forgot-password" className="text-[#666] hover:text-[#999] transition-colors">
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
        <p className="mt-3 text-center text-sm text-[#666]">
          ¿Tienda nueva?{" "}
          <Link to="/register" className="text-[#00e5a0] font-medium cursor-pointer">
            Regístrate aquí
          </Link>
        </p>
      </div>
    </div>
  );
}
