import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useCartStore } from "@/stores/cartStore";
import { salesApi } from "@/lib/sales";
import { pendingSalesDb } from "@/lib/db";
import type { CreateSaleInput, PendingSale } from "@/types/sale";

type PaymentMethod = "cash" | "card" | "transfer";

const methodOptions: { value: PaymentMethod; emoji: string; label: string; sub: string }[] = [
  { value: "cash", emoji: "💵", label: "Efectivo", sub: "Pago en mano" },
  { value: "card", emoji: "💳", label: "Tarjeta", sub: "Débito o crédito" },
  { value: "transfer", emoji: "📱", label: "Transferencia", sub: "CoDi / SPEI" },
];

export default function Payment() {
  const navigate = useNavigate();
  const items = useCartStore((s) => s.items);
  const total = useCartStore((s) => s.total());
  const itemCount = useCartStore((s) => s.itemCount());
  const clear = useCartStore((s) => s.clear);

  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [received, setReceived] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const receivedNum = parseFloat(received) || 0;
  const change = method === "cash" && receivedNum >= total
    ? Math.round((receivedNum - total) * 100) / 100
    : null;

  const handleConfirm = async () => {
    setError(null);
    setLoading(true);

    const input: CreateSaleInput = {
      items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
      payment_method: method,
    };

    try {
      if (navigator.onLine) {
        const sale = await salesApi.create(input);
        clear();
        navigate("/receipt", { state: { sale, offline: false } });
      } else {
        const pendingSale: PendingSale = {
          id: crypto.randomUUID(),
          items: input.items,
          payment_method: input.payment_method,
          created_at: new Date().toLocaleString("sv-SE", { timeZone: "America/Mexico_City" }).replace("T", " "),
          synced: false,
        };
        await pendingSalesDb.add(pendingSale);
        const localSale = {
          id: pendingSale.id,
          total,
          payment_method: method,
          items: items.map((i) => ({
            product_name: i.name,
            quantity: i.quantity,
            unit_price: i.price,
            subtotal: i.price * i.quantity,
          })),
          created_at: pendingSale.created_at,
          offline: true,
        };
        clear();
        navigate("/receipt", { state: { sale: localSale, offline: true } });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar venta");
    } finally {
      setLoading(false);
    }
  };

  const canConfirm =
    !loading &&
    items.length > 0 &&
    (method !== "cash" || receivedNum >= total);

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
      <header className="px-4 py-3 flex items-center gap-3 border-b border-white/[0.06]">
        <button
          onClick={() => navigate("/scanner")}
          aria-label="Volver"
          className="w-9 h-9 rounded-full bg-[#1a1a1a] border border-white/[0.08] text-white flex items-center justify-center"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-semibold text-[#f0f0f0]">Cobrar</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {/* Total card */}
        <div
          className="rounded-[16px] px-6 py-5 text-center"
          style={{
            background: "rgba(0,229,160,0.06)",
            border: "1px solid rgba(0,229,160,0.15)",
          }}
        >
          <p className="text-xs font-semibold text-[#00e5a0] uppercase tracking-widest mb-2">
            Total a cobrar
          </p>
          <p className="text-5xl font-bold text-[#f0f0f0] font-mono">${total.toFixed(2)}</p>
          <p className="mt-2 text-sm text-[#666]">
            {itemCount} producto{itemCount !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Items summary */}
        <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-[14px] overflow-hidden">
          {items.map((item, i) => (
            <div
              key={item.product_id}
              className={`px-4 py-3 flex justify-between items-center ${
                i < items.length - 1 ? "border-b border-white/[0.06]" : ""
              }`}
            >
              <div>
                <p className="text-sm font-medium text-[#f0f0f0]">{item.name}</p>
                <p className="text-xs text-[#666] mt-0.5">
                  x{item.quantity} · ${item.price.toFixed(2)} c/u
                </p>
              </div>
              <span className="text-sm font-bold text-[#f0f0f0] font-mono">
                ${(item.price * item.quantity).toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        {/* Payment method */}
        <div>
          <p className="text-xs font-semibold text-[#666] uppercase tracking-wider mb-3">
            Método de pago
          </p>
          <div className="flex flex-col gap-2">
            {methodOptions.map(({ value, emoji, label, sub }) => (
              <button
                key={value}
                type="button"
                onClick={() => setMethod(value)}
                className="flex items-center gap-4 px-4 py-4 rounded-[14px] border transition-all duration-150 w-full text-left"
                style={{
                  borderColor: method === value ? "#00e5a0" : "rgba(255,255,255,0.08)",
                  background: method === value ? "rgba(0,229,160,0.06)" : "#1a1a1a",
                }}
              >
                <span className="text-2xl flex-shrink-0">{emoji}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#f0f0f0]">{label}</p>
                  <p className="text-xs text-[#666] mt-0.5">{sub}</p>
                </div>
                <div
                  className="relative w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={{
                    borderColor: method === value ? "#00e5a0" : "rgba(255,255,255,0.2)",
                    background: method === value ? "#00e5a0" : "transparent",
                  }}
                >
                  {method === value && <div className="w-2 h-2 rounded-full bg-black" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Cash input */}
        {method === "cash" && (
          <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-[14px] p-4 space-y-3">
            <label className="text-xs font-semibold text-[#666] uppercase tracking-wider block">
              Con cuánto paga
            </label>

            {/* Quick denomination buttons */}
            <div className="grid grid-cols-5 gap-2">
              {(["exacto", 50, 100, 200, 500] as const).map((d) => {
                const val = d === "exacto" ? parseFloat(total.toFixed(2)) : d;
                const isActive = parseFloat(received) === val;
                const covers = val >= total;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setReceived(String(val))}
                    className="h-12 rounded-[10px] text-sm font-bold transition-all"
                    style={{
                      background: isActive
                        ? "#00e5a0"
                        : covers
                        ? "rgba(0,229,160,0.08)"
                        : "#242424",
                      border: isActive
                        ? "1.5px solid #00e5a0"
                        : covers
                        ? "1px solid rgba(0,229,160,0.25)"
                        : "1px solid rgba(255,255,255,0.08)",
                      color: isActive ? "#000" : covers ? "#00e5a0" : "#555",
                    }}
                  >
                    {d === "exacto" ? "Exacto" : `$${d}`}
                  </button>
                );
              })}
            </div>

            {/* Manual input */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666] font-mono">$</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="Otro monto..."
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                className="w-full h-11 bg-[#242424] border border-white/[0.14] rounded-[10px] pl-7 pr-4 text-[#f0f0f0] font-mono text-base focus:outline-none focus:border-[#00e5a0]"
              />
            </div>

            {/* Cambio */}
            <div
              className="flex justify-between items-center p-3 rounded-[10px] border transition-colors"
              style={{
                background: change !== null ? "rgba(0,229,160,0.08)" : "#242424",
                borderColor: change !== null ? "rgba(0,229,160,0.3)" : "rgba(255,255,255,0.08)",
              }}
            >
              <span className="text-xs uppercase tracking-wider font-semibold text-[#999]">Cambio</span>
              <span className="font-mono font-bold text-xl" style={{ color: change !== null ? "#00e5a0" : "#444" }}>
                {change !== null ? `$${change.toFixed(2)}` : "—"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Confirm button */}
      <div className="bg-[#1a1a1a] border-t border-white/[0.08] px-4 py-4">
        {error && (
          <div
            className="mb-3 px-4 py-2.5 rounded-[10px] text-sm text-[#ff6b6b] text-center"
            style={{
              background: "rgba(255,107,107,0.1)",
              border: "1px solid rgba(255,107,107,0.2)",
            }}
          >
            {error}
          </div>
        )}
        <button
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="w-full rounded-[12px] bg-[#00e5a0] text-black font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ height: "52px" }}
        >
          {loading ? "Procesando..." : "✓ Confirmar cobro"}
        </button>
      </div>
    </div>
  );
}
