import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Plus, MoreVertical, Pencil, Trash2, AlertCircle, Check } from "lucide-react";
import { creditApi } from "@/lib/credit";
import { useAuthStore } from "@/stores/authStore";
import type { CreditAccount } from "@/types/credit";
import Modal from "@/components/Modal";
import Navbar from "@/components/Navbar";

const inputCls =
  "w-full bg-[#242424] border border-white/[0.08] rounded-[10px] px-4 h-12 text-[#f0f0f0] text-base placeholder:text-[#666] focus:border-[#00e5a0] focus:outline-none focus:ring-1 focus:ring-[#00e5a0]/30";
const labelCls = "text-xs text-[#666] uppercase tracking-wider mb-1.5 block";

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

// ── modal: nuevo cliente ───────────────────────────────────────────────────

function NewClientModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await creditApi.create({ customer_name: name.trim(), customer_phone: phone.trim() || undefined });
      qc.invalidateQueries({ queryKey: ["credit"] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear cliente");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Nuevo cliente">
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelCls}>Nombre del cliente *</label>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            placeholder="Nombre (Apellido opcional)"
            autoFocus
          />
        </div>
        <div>
          <label className={labelCls}>Teléfono (opcional)</label>
          <input
            className={inputCls}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="55 1234 5678"
          />
        </div>
        {error && <p className="text-xs text-[#ff6b6b]">{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={loading || !name.trim()}
          className="w-full h-12 mt-1 rounded-[12px] bg-[#00e5a0] text-black font-bold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "Agregando..." : "Agregar cliente"}
        </button>
      </div>
    </Modal>
  );
}

// ── modal: pago ────────────────────────────────────────────────────────────

function PayModal({ account, onClose }: { account: CreditAccount; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = parseFloat(amount) || 0;
  const isValid = num > 0 && num <= account.balance;

  const handlePay = async () => {
    setLoading(true);
    setError(null);
    try {
      await creditApi.pay(account.id, num);
      qc.invalidateQueries({ queryKey: ["credit"] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar pago");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Registrar pago">
      <p className="text-sm text-[#999] -mt-3 mb-4">{account.customer_name}</p>
      <p className="text-center text-sm text-[#ff6b6b] mb-4">
        Deuda actual: ${account.balance.toFixed(2)}
      </p>
      <div className="flex flex-col gap-3">
        <div>
          <label className={labelCls}>Monto a pagar *</label>
          <input
            className={inputCls}
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            style={{ borderColor: "rgba(0,229,160,0.3)" }}
            autoFocus
          />
          {num > account.balance && (
            <p className="text-xs text-[#ff6b6b] mt-1">El pago excede la deuda actual</p>
          )}
        </div>
        {error && <p className="text-xs text-[#ff6b6b]">{error}</p>}
        <button
          onClick={handlePay}
          disabled={loading || !isValid}
          className="w-full h-12 rounded-[12px] bg-[#00e5a0] text-black font-bold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "Procesando..." : "Confirmar pago"}
        </button>
      </div>
    </Modal>
  );
}

// ── modal: agregar fiado ───────────────────────────────────────────────────

function ChargeModal({ account, onClose }: { account: CreditAccount; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = parseFloat(amount) || 0;

  const handleCharge = async () => {
    setLoading(true);
    setError(null);
    try {
      await creditApi.charge(account.id, num, note.trim() || undefined);
      qc.invalidateQueries({ queryKey: ["credit"] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al agregar fiado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Agregar fiado">
      <p className="text-sm text-[#999] -mt-3 mb-4">{account.customer_name}</p>
      <div className="flex flex-col gap-3">
        <div>
          <label className={labelCls}>Monto del fiado *</label>
          <input
            className={inputCls}
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            style={{ borderColor: "rgba(255,107,107,0.3)" }}
            autoFocus
          />
        </div>
        <div>
          <label className={labelCls}>Nota (opcional)</label>
          <input
            className={inputCls}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej. 2 Cocas, 1 pan..."
          />
        </div>
        {error && <p className="text-xs text-[#ff6b6b]">{error}</p>}
        <button
          onClick={handleCharge}
          disabled={loading || num <= 0}
          className="w-full h-12 rounded-[12px] font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "#ff6b6b" }}
        >
          {loading ? "Procesando..." : "Agregar fiado"}
        </button>
      </div>
    </Modal>
  );
}

// ── sheet: opciones de cliente ─────────────────────────────────────────────

function OptionsSheet({
  account,
  onClose,
  onEdit,
  onDelete,
}: {
  account: CreditAccount;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Modal isOpen onClose={onClose} title={account.customer_name}>
      <p className="text-xs text-[#666] -mt-4 mb-5">Saldo: ${account.balance.toFixed(2)}</p>
      <div className="flex flex-col gap-2">
        <button
          onClick={onEdit}
          className="flex items-center gap-4 px-4 py-4 rounded-[12px] text-left w-full"
          style={{ background: "#242424", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <Pencil size={20} color="#666" />
          <div>
            <p className="text-sm font-semibold text-[#f0f0f0]">Editar cliente</p>
            <p className="text-xs text-[#666] mt-0.5">Cambiar nombre o teléfono</p>
          </div>
        </button>

        {account.balance === 0 ? (
          <button
            onClick={onDelete}
            className="flex items-center gap-4 px-4 py-4 rounded-[12px] text-left w-full"
            style={{ background: "rgba(255,107,107,0.06)", border: "1px solid rgba(255,107,107,0.15)" }}
          >
            <Trash2 size={20} color="#ff6b6b" />
            <div>
              <p className="text-sm font-semibold text-[#ff6b6b]">Eliminar cliente</p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(255,107,107,0.6)" }}>
                Se eliminará su historial completo
              </p>
            </div>
          </button>
        ) : (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-[12px]"
            style={{ background: "rgba(255,159,67,0.06)", border: "1px solid rgba(255,159,67,0.15)" }}
          >
            <AlertCircle size={16} color="#ff9f43" />
            <p className="text-xs text-[#ff9f43]">
              No puedes eliminar un cliente con deuda. Registra el pago completo primero.
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-2 w-full h-11 rounded-[12px] text-sm text-[#666] font-medium"
          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
        >
          Cancelar
        </button>
      </div>
    </Modal>
  );
}

// ── modal: editar cliente ──────────────────────────────────────────────────

function EditClientModal({
  account,
  onClose,
}: {
  account: CreditAccount;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(account.customer_name);
  const [phone, setPhone] = useState(account.customer_phone ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      await creditApi.update(account.id, {
        customer_name: name,
        customer_phone: phone || undefined,
      });
      qc.invalidateQueries({ queryKey: ["credit", "accounts"] });
      qc.invalidateQueries({ queryKey: ["credit", "summary"] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Editar cliente">
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelCls}>Nombre del cliente</label>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            style={{ textTransform: "uppercase" }}
            autoFocus
          />
        </div>
        <div>
          <label className={labelCls}>Teléfono (opcional)</label>
          <input
            className={inputCls}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        {error && (
          <div
            className="px-3 py-2 rounded-[8px] text-sm text-[#ff6b6b]"
            style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.2)" }}
          >
            {error}
          </div>
        )}
        <div className="flex gap-2 mt-1">
          <button
            onClick={onClose}
            className="flex-1 h-12 rounded-[12px] text-[#666] font-medium text-sm"
            style={{ background: "#242424", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={loading || !name.trim()}
            className="h-12 rounded-[12px] bg-[#00e5a0] text-black font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ flex: 2 }}
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Check size={18} strokeWidth={2.5} />
                Guardar
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── main component ─────────────────────────────────────────────────────────

export default function Credit() {
  const user = useAuthStore((s) => s.user);
  const isOwner = user?.role === "owner";

  const [search, setSearch] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);
  const [payAccount, setPayAccount] = useState<CreditAccount | null>(null);
  const [chargeAccount, setChargeAccount] = useState<CreditAccount | null>(null);
  const [editingAccount, setEditingAccount] = useState<CreditAccount | null>(null);
  const [showOptionsSheet, setShowOptionsSheet] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const qc = useQueryClient();

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["credit", "accounts", search],
    queryFn: () => creditApi.list(search || undefined),
  });

  const { data: summary } = useQuery({
    queryKey: ["credit", "summary"],
    queryFn: creditApi.summary,
    enabled: isOwner,
  });

  const closeModals = useCallback(() => {
    setShowNewClient(false);
    setPayAccount(null);
    setChargeAccount(null);
    setShowOptionsSheet(false);
    setShowEditModal(false);
    setEditingAccount(null);
  }, []);

  const confirmarEliminar = () => {
    if (!editingAccount) return;
    const confirmado = window.confirm(
      `¿Eliminar a ${editingAccount.customer_name}?\n\nEsta acción eliminará su historial completo y no se puede deshacer.`
    );
    if (!confirmado) return;
    creditApi
      .remove(editingAccount.id)
      .then(() => {
        qc.invalidateQueries({ queryKey: ["credit", "accounts"] });
        qc.invalidateQueries({ queryKey: ["credit", "summary"] });
        setEditingAccount(null);
      })
      .catch((err) => {
        alert("Error: " + (err instanceof Error ? err.message : String(err)));
      });
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] pb-24">
      {/* Header */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-[#f0f0f0]">Fiado digital</h1>
          <button
            onClick={() => setShowNewClient(true)}
            className="px-4 py-2 rounded-full text-sm font-semibold text-[#00e5a0]"
            style={{ background: "rgba(0,229,160,0.12)", border: "1px solid rgba(0,229,160,0.25)" }}
          >
            + Cliente
          </button>
        </div>

        {/* Summary card (owner only) */}
        {isOwner && summary && (
          <div
            className="mt-3 rounded-[14px] px-4 py-4 flex justify-between items-center"
            style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div>
              <p className="text-xs text-[#666] uppercase tracking-wider mb-1">Total que te deben</p>
              <p className="text-2xl font-bold text-[#ff6b6b] font-mono">
                ${summary.total_owed.toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-[#666]">{summary.accounts_count} clientes</p>
              {summary.overdue_count > 0 && (
                <p className="text-xs text-[#ff9f43] mt-1">
                  {summary.overdue_count} con +30 días
                </p>
              )}
            </div>
          </div>
        )}

        {/* Search */}
        <input
          className="mt-3 w-full bg-[#1a1a1a] border border-white/[0.08] rounded-[10px] px-4 h-11 text-[#f0f0f0] text-sm placeholder:text-[#666] focus:border-[#00e5a0] focus:outline-none"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente..."
        />
      </div>

      {/* Lista */}
      <div className="px-4 flex flex-col gap-2.5">
        {isLoading && (
          <>
            {[80, 80, 80].map((h, i) => (
              <div key={i} className="bg-[#1a1a1a] animate-pulse rounded-[14px]" style={{ height: h }} />
            ))}
          </>
        )}

        {!isLoading && accounts?.length === 0 && (
          <div className="py-16 text-center">
            <div className="text-5xl opacity-20 mb-3">📋</div>
            <p className="text-sm text-[#666]">Sin clientes con fiado</p>
            <p className="text-xs text-[#444] mt-1">Toca + Cliente para agregar uno</p>
          </div>
        )}

        {accounts?.map((acct) => {
          const overdue = acct.balance > 0 && (acct.days_since_payment > 30 || acct.days_since_payment === -1);
          return (
            <div
              key={acct.id}
              className="rounded-[14px] px-4 py-4"
              style={{
                background: "#1a1a1a",
                border: overdue
                  ? "1px solid rgba(255,107,107,0.3)"
                  : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {/* Header */}
              <div className="flex justify-between items-start">
                <div className="flex items-center">
                  <div
                    className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-[#999]"
                    style={{ background: "#242424", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    {initials(acct.customer_name)}
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-semibold text-[#f0f0f0]">{acct.customer_name}</p>
                    <p className="text-xs text-[#666] mt-0.5">
                      {acct.customer_phone || "Sin teléfono"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-[#ff6b6b] font-mono">
                    ${acct.balance.toFixed(2)}
                  </p>
                  {acct.days_since_payment > 30 && (
                    <span
                      className="inline-block text-xs text-[#ff6b6b] px-2 py-0.5 rounded-full mt-1"
                      style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.2)" }}
                    >
                      ⚠ {acct.days_since_payment} días
                    </span>
                  )}
                  {acct.days_since_payment >= 0 && acct.days_since_payment <= 30 && (
                    <p className="text-xs text-[#666] mt-1">Pago hace {acct.days_since_payment} días</p>
                  )}
                  {acct.days_since_payment === -1 && acct.balance > 0 && (
                    <p className="text-xs text-[#ff9f43] mt-1">Nunca ha pagado</p>
                  )}
                </div>
              </div>

              <div className="mt-3 mb-3 h-px bg-white/[0.06]" />

              {/* Acciones */}
              <div className="flex gap-2">
                <button
                  onClick={() => setPayAccount(acct)}
                  className="flex-1 h-9 rounded-[8px] text-sm font-semibold text-[#00e5a0] flex items-center justify-center gap-1.5"
                  style={{ background: "rgba(0,229,160,0.1)", border: "1px solid rgba(0,229,160,0.2)" }}
                >
                  <CheckCircle size={14} />
                  Pago
                </button>
                <button
                  onClick={() => setChargeAccount(acct)}
                  className="flex-1 h-9 rounded-[8px] text-sm font-semibold text-[#ff6b6b] flex items-center justify-center gap-1.5"
                  style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.2)" }}
                >
                  <Plus size={14} />
                  Fiado
                </button>
                <button
                  onClick={() => { setEditingAccount(acct); setShowOptionsSheet(true); }}
                  className="w-9 h-9 rounded-[8px] flex-shrink-0 flex items-center justify-center"
                  style={{ background: "#242424", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <MoreVertical size={16} color="#666" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modales */}
      {showNewClient && <NewClientModal onClose={closeModals} />}
      {payAccount && <PayModal account={payAccount} onClose={closeModals} />}
      {chargeAccount && <ChargeModal account={chargeAccount} onClose={closeModals} />}
      {showOptionsSheet && editingAccount && (
        <OptionsSheet
          account={editingAccount}
          onClose={() => setShowOptionsSheet(false)}
          onEdit={() => {
            setShowOptionsSheet(false);
            setTimeout(() => setShowEditModal(true), 200);
          }}
          onDelete={() => {
            setShowOptionsSheet(false);
            setTimeout(() => confirmarEliminar(), 200);
          }}
        />
      )}
      {showEditModal && editingAccount && (
        <EditClientModal
          account={editingAccount}
          onClose={() => {
            setShowEditModal(false);
            setEditingAccount(null);
          }}
        />
      )}

      <Navbar />
    </div>
  );
}
