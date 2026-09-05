import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";
import { registersApi } from "@/lib/registers";
import { usersApi } from "@/lib/users";
import Modal from "@/components/Modal";
import Navbar from "@/components/Navbar";
import { useBLEPrinter } from "@/hooks/useBLEPrinter";
import { buildRegisterTicket } from "@/lib/escpos";

function fmtMXN(n: number) {
  return n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

const roleColors: Record<string, string> = {
  owner:     "#00e5a0",
  cashier:   "#74b9ff",
  inventory: "#ff9f43",
};

const roleLabels: Record<string, string> = {
  owner:     "Propietario",
  cashier:   "Cajero",
  inventory: "Inventarista",
};

const emptyOpen  = { cashier_id: "", initial_amount: "" };
const emptyClose = { declared_amount: "", notes: "" };

type CloseStep = "declare" | "revealing" | "result";

type CloseResult = {
  initial_amount:          number;
  cash_sales:              number;
  cash_credit_payments:    number;
  credit_sales_generated:  number;
  turno_expenses:          number;
  expected_amount:         number;
  declared_amount:         number;
  difference:              number;
};

export default function CashRegister() {
  const { user } = useAuthStore();
  const isOwner = user?.role === "owner";
  const queryClient = useQueryClient();

  const [showOpenModal,  setShowOpenModal]  = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [openForm,  setOpenForm]  = useState(emptyOpen);
  const [closeForm, setCloseForm] = useState(emptyClose);
  const [closeStep,    setCloseStep]    = useState<CloseStep>("declare");
  const [closeResult,  setCloseResult]  = useState<CloseResult | null>(null);
  const [closeContext, setCloseContext] = useState<{ cashierName: string; openedAt: string } | null>(null);
  const { print, printing, error: printError, isSupported } = useBLEPrinter();

  const { data: current, isLoading } = useQuery<import("@/types/register").CashRegister | null>({
    queryKey: ["registers", "current"],
    queryFn:  registersApi.current,
    refetchInterval: 30000,
  });

  const { data: history } = useQuery({
    queryKey: ["registers", "list"],
    queryFn:  registersApi.list,
    enabled:  isOwner,
  });

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn:  usersApi.list,
    enabled:  showOpenModal,
  });

  const activeUsers = (users ?? [])
    .filter((u) => u.active)
    .sort((a, b) => (a.id === user?.id ? -1 : b.id === user?.id ? 1 : 0));

  const soloOwner = activeUsers.length === 1 && activeUsers[0]?.id === user?.id;

  useEffect(() => {
    if (activeUsers.length === 1) {
      setOpenForm((f) => ({ ...f, cashier_id: activeUsers[0].id }));
    }
  }, [activeUsers.length]);

  const openMutation = useMutation({
    mutationFn: () => registersApi.open({
      initial_amount: parseFloat(openForm.initial_amount) || 0,
      ...(openForm.cashier_id ? { cashier_id: openForm.cashier_id } : {}),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registers"] });
      setShowOpenModal(false);
      setOpenForm(emptyOpen);
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => registersApi.close({
      declared_amount: parseFloat(closeForm.declared_amount) || 0,
      notes: closeForm.notes || undefined,
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["registers"] });
      setCloseResult(data as CloseResult);
      setCloseStep("revealing");
      setTimeout(() => setCloseStep("result"), 1000);
    },
  });

  function resetCloseModal() {
    setShowCloseModal(false);
    setCloseForm(emptyClose);
    setCloseStep("declare");
    setCloseResult(null);
    setCloseContext(null);
  }

  const closedHistory = (history ?? []).filter((r) => r.status === "closed");

  const closeModalTitle =
    closeStep === "declare"   ? "Cuenta el dinero en caja" :
    closeStep === "revealing" ? "Calculando..." :
    closeResult
      ? closeResult.difference === 0 ? "✅ ¡Caja cuadrada!"
        : closeResult.difference > 0 ? "📈 Sobrante en caja"
        : "⚠️ Faltante en caja"
      : "Resultado del corte";

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f0f", paddingBottom: "88px" }}>
      <div className="px-4 pt-5 pb-3">
        <h1 className="text-2xl font-bold text-[#f0f0f0]">Caja</h1>
      </div>

      <div className="px-4 flex flex-col gap-3">
        {isLoading && (
          <div className="bg-[#1a1a1a] animate-pulse rounded-[16px] h-48" />
        )}

        {/* ── Sin turno activo ─────────────────── */}
        {!isLoading && !current && (
          <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-[16px] p-6 text-center">
            {isOwner ? (
              <>
                <p className="text-lg font-bold text-[#f0f0f0]">Sin turno activo</p>
                <p className="text-sm text-[#666] mt-1 mb-5">
                  Abre un turno para controlar el efectivo de caja
                </p>
                <button
                  onClick={() => setShowOpenModal(true)}
                  className="w-full h-12 rounded-[12px] font-bold text-black"
                  style={{ background: "#00e5a0" }}
                >
                  Abrir turno
                </button>
              </>
            ) : (
              <>
                <p className="text-3xl mb-3">🔒</p>
                <p className="text-lg font-bold text-[#f0f0f0]">No tienes un turno activo</p>
                <p className="text-sm text-[#666] mt-1">
                  Pide a tu propietario que abra tu turno
                </p>
              </>
            )}
          </div>
        )}

        {/* ── Turno activo ─────────────────────── */}
        {!isLoading && current && (
          <div
            className="rounded-[16px] p-5"
            style={{
              background: "rgba(0,229,160,0.06)",
              border:     "1px solid rgba(0,229,160,0.2)",
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[#00e5a0] text-sm animate-pulse">●</span>
              <span className="text-xs font-bold text-[#00e5a0] uppercase tracking-wider">
                {isOwner ? "Turno activo" : "Tu turno activo"}
              </span>
            </div>

            <p className="text-lg font-bold text-[#f0f0f0] mt-2">{current.cashier_name}</p>
            <p className="text-sm text-[#666]">Abierto: {fmtDateTime(current.opened_at)}</p>

            <div className="mt-4 mb-4 border-t border-white/[0.06]" />

            <div>
              <p className="text-[10px] text-[#666] uppercase tracking-wider mb-1">Fondo inicial</p>
              <p className="text-xl font-bold text-[#f0f0f0] font-mono">
                ${fmtMXN(current.initial_amount)}
              </p>
            </div>

            <p className="text-xs text-center mt-2" style={{ color: "#555" }}>
              El resumen se revelará al cerrar el turno
            </p>

            <button
              onClick={() => {
                setCloseContext({ cashierName: current.cashier_name, openedAt: current.opened_at });
                setShowCloseModal(true);
              }}
              className="mt-4 w-full h-12 rounded-[12px] font-bold"
              style={{
                background: "rgba(255,107,107,0.15)",
                border:     "1px solid rgba(255,107,107,0.3)",
                color:      "#ff6b6b",
              }}
            >
              {isOwner ? "Cerrar turno" : "Cerrar mi turno"}
            </button>
          </div>
        )}

        {/* ── Historial ────────────────────────── */}
        {closedHistory.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[#555] uppercase tracking-wider px-1 mb-2">
              Historial de cortes
            </p>
            <div className="flex flex-col gap-2">
              {closedHistory.map((r) => (
                <div
                  key={r.id}
                  className="rounded-[12px] px-4 py-4 mb-2"
                  style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <p className="text-sm font-semibold text-[#f0f0f0]">{r.cashier_name}</p>
                  <p className="text-xs text-[#666] mt-0.5">
                    {fmtDateTime(r.opened_at)}
                    {r.closed_at ? ` → ${fmtDateTime(r.closed_at)}` : ""}
                  </p>

                  <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "12px 0" }} />

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-xs text-[#666]">VENTAS</p>
                      <p className="text-sm font-bold text-[#00e5a0]">${fmtMXN(r.cash_sales ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#666]">GASTOS</p>
                      <p className={`text-sm font-bold ${(r.turno_expenses ?? 0) > 0 ? "text-[#ff6b6b]" : "text-[#444]"}`}>
                        {(r.turno_expenses ?? 0) > 0 ? `-$${fmtMXN(r.turno_expenses!)}` : "$0.00"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[#666]">ESPERADO</p>
                      <p className="text-sm font-bold text-[#f0f0f0]">
                        {r.expected_amount !== null ? `$${fmtMXN(r.expected_amount)}` : "—"}
                      </p>
                    </div>
                  </div>

                  {(r.credit_sales_generated ?? 0) > 0 && (
                    <div className="text-xs mt-1 pt-1" style={{ color: "#ff9f43", borderTop: "1px solid #2a2a2a" }}>
                      +${fmtMXN(r.credit_sales_generated!)} en fiados generados (no incluido arriba)
                    </div>
                  )}

                  <div className="mt-3 flex justify-between items-center">
                    <p className="text-sm text-[#999]">
                      Declarado: {r.declared_amount !== null ? `$${fmtMXN(r.declared_amount)}` : "—"}
                    </p>
                    {r.difference === null ? (
                      <p className="text-xs text-[#555]">—</p>
                    ) : r.difference === 0 ? (
                      <p className="text-sm font-semibold text-[#00e5a0]">✓ Cuadrado</p>
                    ) : r.difference > 0 ? (
                      <p className="text-sm font-semibold text-[#00e5a0]">+${fmtMXN(r.difference)} Sobrante</p>
                    ) : (
                      <p className="text-sm font-semibold text-[#ff6b6b]">-${fmtMXN(Math.abs(r.difference))} Faltante</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal abrir turno ──────────────────── */}
      <Modal
        isOpen={showOpenModal}
        onClose={() => { setShowOpenModal(false); setOpenForm(emptyOpen); }}
        title="Abrir turno"
        maxWidth={400}
      >
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs text-[#666] uppercase tracking-wider mb-2">Cajero</p>
            {soloOwner ? (
              <p className="text-sm text-[#666]">Turno a tu nombre</p>
            ) : (
              <div className="flex flex-col gap-2">
                {activeUsers.map((u) => {
                  const isMe = u.id === user?.id;
                  const selected = openForm.cashier_id === u.id;
                  return (
                    <button
                      key={u.id}
                      onClick={() => setOpenForm((f) => ({ ...f, cashier_id: u.id }))}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-[10px] transition-colors"
                      style={{
                        background: selected ? "rgba(0,229,160,0.12)" : "#242424",
                        border:     selected ? "1.5px solid rgba(0,229,160,0.5)" : "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <span
                        className="text-sm font-semibold"
                        style={{ color: selected ? "#00e5a0" : "#f0f0f0" }}
                      >
                        {u.name}{isMe ? " (Tú)" : ""}
                      </span>
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: `${roleColors[u.role]}20`,
                          color:      roleColors[u.role],
                        }}
                      >
                        {roleLabels[u.role] ?? u.role}
                      </span>
                    </button>
                  );
                })}
                {activeUsers.length === 0 && (
                  <p className="text-sm text-[#555] text-center py-3">Cargando usuarios...</p>
                )}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs text-[#666] uppercase tracking-wider mb-1.5">
              Fondo inicial en caja
            </p>
            <div className="relative">
              <span
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[#666] font-mono font-bold"
                style={{ fontSize: 20 }}
              >
                $
              </span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={openForm.initial_amount}
                onChange={(e) => setOpenForm((f) => ({ ...f, initial_amount: e.target.value }))}
                className="w-full bg-[#242424] border border-white/[0.08] rounded-[10px] pl-9 pr-4 h-14 text-[#f0f0f0] placeholder:text-[#555] focus:border-[#00e5a0] focus:outline-none font-mono"
                style={{ fontSize: 24 }}
              />
            </div>
            <p className="text-xs text-[#555] mt-1.5">Dinero con el que empieza el cajero</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => { setShowOpenModal(false); setOpenForm(emptyOpen); }}
              className="flex-1 h-11 rounded-[10px] text-sm font-semibold text-[#888]"
              style={{ background: "#242424", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              Cancelar
            </button>
            <button
              disabled={(!soloOwner && !openForm.cashier_id) || openMutation.isPending}
              onClick={() => openMutation.mutate()}
              className="flex-1 h-11 rounded-[10px] text-sm font-semibold text-black disabled:opacity-40"
              style={{ background: "#00e5a0" }}
            >
              {openMutation.isPending ? "Abriendo..." : "Abrir turno"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Modal cerrar turno — corte ciego ──── */}
      <Modal
        isOpen={showCloseModal}
        onClose={resetCloseModal}
        title={closeModalTitle}
        maxWidth={420}
      >
        {/* Paso 1 — Declaración ciega */}
        {closeStep === "declare" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-center mb-1" style={{ color: "#666" }}>
              Cuenta físicamente todo el efectivo que hay en el cajón y escribe el total aquí abajo.
            </p>

            <div>
              <p
                className="text-xs font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: "#ff9f43" }}
              >
                Total en caja ahora
              </p>
              <div className="relative">
                <span
                  className="absolute left-4 top-1/2 -translate-y-1/2 font-mono font-bold"
                  style={{ fontSize: 20, color: "#666" }}
                >
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  min="0"
                  autoFocus
                  value={closeForm.declared_amount}
                  onChange={(e) => setCloseForm((f) => ({ ...f, declared_amount: e.target.value }))}
                  className="w-full bg-[#242424] border border-white/[0.08] rounded-[10px] pl-9 pr-4 h-14 text-[#f0f0f0] placeholder:text-[#555] focus:outline-none font-mono"
                  style={{ fontSize: 24, borderColor: closeForm.declared_amount ? "#ff9f43" : undefined }}
                />
              </div>
            </div>

            <input
              type="text"
              placeholder="Observaciones..."
              value={closeForm.notes}
              onChange={(e) => setCloseForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full bg-[#242424] border border-white/[0.08] rounded-[10px] px-4 h-11 text-[#f0f0f0] text-sm placeholder:text-[#666] focus:border-[#00e5a0] focus:outline-none"
            />

            <button
              disabled={!closeForm.declared_amount || parseFloat(closeForm.declared_amount) < 0 || closeMutation.isPending}
              onClick={() => closeMutation.mutate()}
              className="w-full h-12 rounded-[12px] font-bold text-black disabled:opacity-40"
              style={{ background: "#00e5a0" }}
            >
              {closeMutation.isPending ? "Calculando..." : "Revelar resultado"}
            </button>
          </div>
        )}

        {/* Paso intermedio — Animación */}
        {closeStep === "revealing" && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="animate-pulse text-5xl">🔍</div>
            <p className="text-sm" style={{ color: "#666" }}>Calculando diferencia...</p>
          </div>
        )}

        {/* Paso 2 — Resultado revelado */}
        {closeStep === "result" && closeResult && (
          <div className="flex flex-col gap-4">
            <p
              className="text-2xl font-bold text-center"
              style={{
                color: closeResult.difference === 0
                  ? "#00e5a0"
                  : closeResult.difference > 0
                  ? "#00e5a0"
                  : "#ff6b6b",
              }}
            >
              {closeResult.difference === 0
                ? "✅ ¡Caja cuadrada!"
                : closeResult.difference > 0
                ? "📈 Sobrante en caja"
                : "⚠️ Faltante en caja"}
            </p>

            <div
              className="rounded-[12px] p-4"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex justify-between py-1.5">
                <span className="text-sm text-[#666]">Fondo inicial</span>
                <span className="text-sm font-mono text-[#f0f0f0]">${fmtMXN(closeResult.initial_amount)}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-sm text-[#666]">Ventas efectivo</span>
                <span className="text-sm font-mono text-[#00e5a0]">+${fmtMXN(closeResult.cash_sales)}</span>
              </div>
              {closeResult.cash_credit_payments > 0 && (
                <div className="flex justify-between py-1.5">
                  <span className="text-sm text-[#666]">Cobros de fiado</span>
                  <span className="text-sm font-mono text-[#74b9ff]">+${fmtMXN(closeResult.cash_credit_payments)}</span>
                </div>
              )}
              {closeResult.turno_expenses > 0 && (
                <div className="flex justify-between py-1.5">
                  <span className="text-sm text-[#666]">Gastos del turno</span>
                  <span className="text-sm font-mono text-[#ff6b6b]">-${fmtMXN(closeResult.turno_expenses)}</span>
                </div>
              )}

              <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "6px 0" }} />

              <div className="flex justify-between py-1.5">
                <span className="text-sm font-semibold text-[#f0f0f0]">Total esperado</span>
                <span className="text-sm font-bold font-mono text-[#f0f0f0]">${fmtMXN(closeResult.expected_amount)}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-sm text-[#666]">Tu declaración</span>
                <span className="text-sm font-mono text-[#f0f0f0]">${fmtMXN(closeResult.declared_amount)}</span>
              </div>

              {closeResult.credit_sales_generated > 0 && (
                <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-[#666]">Ventas a fiado (informativo)</span>
                    <span className="text-sm font-mono" style={{ color: "#ff9f43" }}>
                      ${fmtMXN(closeResult.credit_sales_generated)}
                    </span>
                  </div>
                  <span className="text-xs block mt-0.5" style={{ color: "#555" }}>
                    No incluido en el total esperado — aún no cobrado
                  </span>
                </div>
              )}

              <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "6px 0" }} />

              <div className="flex justify-between py-1.5">
                <span className="text-sm font-semibold text-[#f0f0f0]">Diferencia</span>
                <span
                  className="text-sm font-bold font-mono"
                  style={{
                    color: closeResult.difference === 0
                      ? "#00e5a0"
                      : closeResult.difference > 0
                      ? "#00e5a0"
                      : "#ff6b6b",
                  }}
                >
                  {closeResult.difference >= 0 ? "+" : ""}
                  {fmtMXN(closeResult.difference)}
                </span>
              </div>
            </div>

            {isSupported && closeContext && (
              <>
                <button
                  onClick={async () => {
                    const store = useAuthStore.getState().store;
                    const data = buildRegisterTicket({
                      storeName: store?.name ?? "Mi Tienda",
                      cashierName: closeContext.cashierName,
                      openedAt: closeContext.openedAt,
                      closedAt: new Date().toISOString(),
                      result: closeResult,
                    });
                    await print(data);
                  }}
                  disabled={printing}
                  className="w-full h-11 rounded-[12px] text-sm font-medium"
                  style={{
                    background: "#242424",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#999",
                    opacity: printing ? 0.6 : 1,
                  }}
                >
                  🖨️ {printing ? "Imprimiendo..." : "Imprimir corte"}
                </button>
                {printError && (
                  <p className="text-xs text-center" style={{ color: "#ff6b6b" }}>{printError}</p>
                )}
              </>
            )}
            <button
              onClick={resetCloseModal}
              className="w-full h-11 rounded-[12px] text-sm font-semibold"
              style={{
                background: "#1a1a1a",
                border:     "1px solid rgba(255,255,255,0.12)",
                color:      "#666",
              }}
            >
              Cerrar
            </button>
          </div>
        )}
      </Modal>

      <Navbar />
    </div>
  );
}
