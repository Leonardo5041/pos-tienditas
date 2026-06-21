import { useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/lib/api";

type Step = "phone" | "code";

export default function ForgotPassword() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const inputStyle = {
    border: "1px solid rgba(255,255,255,0.08)",
    fontFamily: "DM Sans, system-ui, sans-serif",
  };
  const focusHandler = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "#00e5a0";
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0,229,160,0.1)";
  };
  const blurHandler = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
    e.currentTarget.style.boxShadow = "none";
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/api/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al enviar código");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ phone, code, password }),
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al restablecer");
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
          style={{ background: "rgba(0,229,160,0.1)", border: "1.5px solid rgba(0,229,160,0.25)" }}
        >
          <span className="text-4xl">🔑</span>
        </div>
        <h1 className="text-3xl font-bold text-[#f0f0f0] tracking-tight">Mi Tiendita</h1>
        <p className="mt-1.5 text-sm text-[#666]">Recuperar contraseña</p>
      </div>

      <div
        className="w-full max-w-sm bg-[#1a1a1a]"
        style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: "20px", padding: "28px 24px" }}
      >
        {success ? (
          <div className="text-center">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-lg font-semibold text-[#f0f0f0] mb-2">Contraseña actualizada</h2>
            <p className="text-sm text-[#666] mb-6">Ya puedes iniciar sesión con tu nueva contraseña</p>
            <Link
              to="/login"
              className="block w-full h-12 rounded-[10px] bg-[#00e5a0] text-black font-bold text-base flex items-center justify-center"
            >
              Ir al inicio de sesión
            </Link>
          </div>
        ) : step === "phone" ? (
          <>
            <h2 className="text-lg font-semibold text-[#f0f0f0] mb-1">¿Olvidaste tu contraseña?</h2>
            <p className="text-sm text-[#666] mb-6">Te enviamos un código por SMS a tu número registrado</p>
            <form onSubmit={handleSendCode}>
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
                style={inputStyle}
                onFocus={focusHandler}
                onBlur={blurHandler}
              />
              {error && (
                <div
                  className="mt-3 px-4 py-2.5 rounded-[10px] text-sm text-[#ff6b6b]"
                  style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.2)" }}
                >
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="mt-6 w-full h-12 rounded-[10px] bg-[#00e5a0] text-black font-bold text-base transition-opacity"
                style={{ opacity: loading ? 0.7 : 1 }}
              >
                {loading ? "Enviando..." : "Enviar código"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-[#f0f0f0] mb-1">Ingresa el código</h2>
            <p className="text-sm text-[#666] mb-6">
              Enviamos un código de 6 dígitos al <span className="text-[#f0f0f0]">{phone}</span>
            </p>
            <form onSubmit={handleReset}>
              <label className="block text-xs font-semibold text-[#999] uppercase tracking-wider mb-2">
                Código SMS
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                placeholder="123456"
                maxLength={6}
                className="w-full h-12 rounded-[10px] bg-[#242424] px-4 text-base text-[#f0f0f0] placeholder:text-[#555] focus:outline-none transition tracking-widest text-center font-mono"
                style={inputStyle}
                onFocus={focusHandler}
                onBlur={blurHandler}
              />

              <label className="block text-xs font-semibold text-[#999] uppercase tracking-wider mb-2 mt-4">
                Nueva contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Mínimo 6 caracteres"
                  className="w-full h-12 rounded-[10px] bg-[#242424] px-4 pr-12 text-base text-[#f0f0f0] placeholder:text-[#555] focus:outline-none transition"
                  style={inputStyle}
                  onFocus={focusHandler}
                  onBlur={blurHandler}
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
                  style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.2)" }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="mt-6 w-full h-12 rounded-[10px] bg-[#00e5a0] text-black font-bold text-base transition-opacity"
                style={{ opacity: (loading || code.length !== 6) ? 0.5 : 1 }}
              >
                {loading ? "Actualizando..." : "Cambiar contraseña"}
              </button>

              <button
                type="button"
                onClick={() => { setStep("phone"); setError(""); setCode(""); }}
                className="mt-3 w-full text-sm text-[#666] hover:text-[#999] transition-colors"
              >
                Cambiar número
              </button>
            </form>
          </>
        )}

        {!success && (
          <p className="mt-5 text-center text-sm text-[#666]">
            <Link to="/login" className="text-[#00e5a0] font-medium">
              Volver al inicio de sesión
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
