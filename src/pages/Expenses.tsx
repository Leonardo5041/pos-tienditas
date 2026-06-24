import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { expensesApi } from "@/lib/expenses";
import { CATEGORY_LABELS, type ExpenseCategory } from "@/types/expense";
import Modal from "@/components/Modal";
import Navbar from "@/components/Navbar";

const CATEGORIES: ExpenseCategory[] = ["mercancia", "servicios", "mantenimiento", "personal", "otros"];

function fmtMXN(n: number) {
  return n.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short" });
}

function monthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("sv");
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString("sv");
  return { from, to };
}

const PAYMENT_METHODS = [
  { value: "cash",     label: "💵 Efectivo" },
  { value: "card",     label: "💳 Tarjeta" },
  { value: "transfer", label: "📱 Transferencia" },
] as const;

type PaymentMethod = "cash" | "card" | "transfer";

const emptyForm = { category: "" as ExpenseCategory | "", description: "", amount: "", payment_method: "cash" as PaymentMethod };

export default function Expenses() {
  const { user } = useAuthStore();
  const isOwner    = user?.role === "owner";
  const isCashier  = user?.role === "cashier";
  const canCreate  = isOwner || user?.role === "inventory" || isCashier;
  const queryClient = useQueryClient();

  const { from, to } = monthRange();
  const [modalOpen, setModalOpen] = useState(false);
  const [catFilter, setCatFilter] = useState<ExpenseCategory | "all">("all");
  const [form, setForm] = useState(emptyForm);

  const { data: summary } = useQuery({
    queryKey: ["expenses", "summary", from, to],
    queryFn: () => expensesApi.summary({ from, to }),
    enabled: !isCashier,
  });

  const { data: listData } = useQuery({
    queryKey: ["expenses", "list", from, to],
    queryFn: () => expensesApi.list({ from, to }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      expensesApi.create({
        category: form.category as ExpenseCategory,
        description: form.description || undefined,
        amount: parseFloat(form.amount),
        payment_method: form.payment_method,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setModalOpen(false);
      setForm(emptyForm);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => expensesApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expenses"] }),
  });

  const expenses = listData?.expenses ?? [];
  const filtered = catFilter === "all" ? expenses : expenses.filter((e) => e.category === catFilter);

  const totalExpenses = summary?.total_expenses ?? 0;
  const totalSales    = summary?.total_sales    ?? 0;
  const profit        = summary?.profit         ?? 0;

  function closeModal() {
    setModalOpen(false);
    setForm(emptyForm);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f0f", paddingBottom: "88px" }}>
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#f0f0f0]">Gastos</h1>
        {canCreate && (
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 h-9 rounded-full text-sm font-semibold text-black"
            style={{ background: "#00e5a0" }}
          >
            + Gasto
          </button>
        )}
      </div>

      <div className="px-4 flex flex-col gap-3">
        {/* Summary card */}
        {!isCashier && (
          <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-[16px] p-4">
            <p className="text-xs font-semibold text-[#666] uppercase tracking-wider mb-3">Este mes</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-[10px] text-[#666] uppercase tracking-wider mb-1">💰 Ingresos</p>
                <p className="text-base font-bold text-[#00e5a0] font-mono">${fmtMXN(totalSales)}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#666] uppercase tracking-wider mb-1">💸 Gastos</p>
                <p className="text-base font-bold text-[#ff6b6b] font-mono">${fmtMXN(totalExpenses)}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#666] uppercase tracking-wider mb-1">📈 Ganancia</p>
                <p
                  className="text-base font-bold font-mono"
                  style={{ color: profit >= 0 ? "#00e5a0" : "#ff6b6b" }}
                >
                  ${fmtMXN(profit)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Category breakdown */}
        {!isCashier && summary && summary.by_category.length > 0 && (
          <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-[16px] p-4">
            <p className="text-xs font-semibold text-[#666] uppercase tracking-wider mb-3">Por categoría</p>
            <div className="flex flex-col gap-3">
              {summary.by_category.map(({ category, amount }) => {
                const pct = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0;
                return (
                  <div key={category}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-[#f0f0f0]">
                        {CATEGORY_LABELS[category as ExpenseCategory] ?? category}
                      </span>
                      <span className="text-sm font-bold text-[#f0f0f0] font-mono">${fmtMXN(amount)}</span>
                    </div>
                    <div className="h-1.5 bg-[#242424] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: "#ff6b6b" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Category filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {(["all", ...CATEGORIES] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCatFilter(cat as typeof catFilter)}
              className="flex-shrink-0 px-3 h-8 rounded-full text-xs font-semibold transition-colors"
              style={{
                background: catFilter === cat ? "rgba(0,229,160,0.15)" : "#1a1a1a",
                border:     catFilter === cat ? "1px solid rgba(0,229,160,0.4)" : "1px solid rgba(255,255,255,0.08)",
                color:      catFilter === cat ? "#00e5a0" : "#888",
              }}
            >
              {cat === "all" ? "Todos" : CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Expense list */}
        <div className="flex flex-col gap-2 pb-2">
          {filtered.length === 0 && (
            <div className="text-center text-sm text-[#444] py-8">Sin gastos registrados</div>
          )}
          {filtered.map((expense) => (
            <div
              key={expense.id}
              className="rounded-[10px] px-4 py-3 flex justify-between items-center"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex-1 min-w-0 mr-3">
                <p className="text-sm font-semibold text-[#f0f0f0]">
                  {CATEGORY_LABELS[expense.category] ?? expense.category}
                </p>
                {expense.description && (
                  <p className="text-xs text-[#666] mt-0.5 truncate">{expense.description}</p>
                )}
                <p className="text-xs text-[#555] mt-0.5">{fmtDate(expense.created_at)}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-sm font-bold text-[#ff6b6b] font-mono">
                  -${fmtMXN(expense.amount)}
                </span>
                {isOwner && (
                  <button
                    onClick={() => deleteMutation.mutate(expense.id)}
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(255,107,107,0.1)" }}
                  >
                    <Trash2 size={14} color="#ff6b6b" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* New Expense Modal */}
      <Modal isOpen={modalOpen} onClose={closeModal} title="Nuevo gasto" maxWidth={400}>
        <div className="flex flex-col gap-4">
          {/* Category grid 2×3 */}
          <div>
            <p className="text-xs text-[#666] uppercase tracking-wider mb-2">Categoría</p>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setForm((f) => ({ ...f, category: cat }))}
                  className="py-2.5 px-3 rounded-[10px] text-sm font-semibold text-left transition-colors"
                  style={{
                    background: form.category === cat ? "rgba(0,229,160,0.12)" : "#242424",
                    border:     form.category === cat ? "1.5px solid rgba(0,229,160,0.5)" : "1px solid rgba(255,255,255,0.08)",
                    color:      form.category === cat ? "#00e5a0" : "#888",
                  }}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <p className="text-xs text-[#666] uppercase tracking-wider mb-1.5">Descripción (opcional)</p>
            <input
              type="text"
              placeholder="Ej. Luz del mes de junio"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value.toUpperCase() }))}
              className="w-full bg-[#242424] border border-white/[0.08] rounded-[10px] px-4 h-11 text-[#f0f0f0] text-sm placeholder:text-[#666] focus:border-[#00e5a0] focus:outline-none"
            />
          </div>

          {/* Amount */}
          <div>
            <p className="text-xs text-[#666] uppercase tracking-wider mb-1.5">Monto</p>
            <input
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              autoFocus
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-full bg-[#242424] border border-white/[0.08] rounded-[10px] px-4 h-14 text-[#f0f0f0] placeholder:text-[#555] focus:border-[#00e5a0] focus:outline-none"
              style={{ fontSize: "28px", fontFamily: "DM Mono, monospace" }}
            />
          </div>

          {/* Payment method */}
          <div>
            <p className="text-xs text-[#666] uppercase tracking-wider mb-2">¿Cómo se pagó?</p>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, payment_method: value }))}
                  className="py-2.5 rounded-[10px] text-sm font-semibold transition-colors"
                  style={{
                    background: form.payment_method === value ? "rgba(0,229,160,0.12)" : "#242424",
                    border:     form.payment_method === value ? "1.5px solid rgba(0,229,160,0.5)" : "1px solid rgba(255,255,255,0.08)",
                    color:      form.payment_method === value ? "#00e5a0" : "#888",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs mt-1.5" style={{ color: form.payment_method === "cash" ? "#ff9f43" : "#666" }}>
              {form.payment_method === "cash"
                ? "Este gasto restará del corte de caja"
                : "No afecta el corte de caja"}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={closeModal}
              className="flex-1 h-11 rounded-[10px] text-sm font-semibold text-[#888]"
              style={{ background: "#242424", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              Cancelar
            </button>
            <button
              disabled={!form.category || !form.amount || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              className="flex-1 h-11 rounded-[10px] text-sm font-semibold text-black disabled:opacity-40"
              style={{ background: "#00e5a0" }}
            >
              {createMutation.isPending ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </Modal>

      <Navbar />
    </div>
  );
}
