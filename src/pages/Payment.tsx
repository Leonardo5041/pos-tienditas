import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useCartStore } from "@/stores/cartStore";
import { salesApi } from "@/lib/sales";
import { creditApi } from "@/lib/credit";
import { pendingSalesDb, posDb } from "@/lib/db";
import type { CreateSaleInput, PendingSale } from "@/types/sale";
import type { CreditAccount } from "@/types/credit";
import { useOfflineSync } from "@/hooks/useOfflineSync";

type PaymentMethod = "cash" | "card" | "transfer" | "credit";

export default function Payment() {
  const navigate = useNavigate();
  const items = useCartStore((s) => s.items);
  const total = useCartStore((s) => s.total());
  const itemCount = useCartStore((s) => s.itemCount());
  const clear = useCartStore((s) => s.clear);

  const { refreshCount } = useOfflineSync();

  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [received, setReceived] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CreditAccount[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CreditAccount | null>(null);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const receivedNum = parseFloat(received) || 0;
  const change =
    method === "cash" && receivedNum >= total
      ? Math.round((receivedNum - total) * 100) / 100
      : null;

  const paymentOptions = [
    { icon: "💵", name: "Efectivo", sub: "Pago en mano", value: "cash" as const },
    { icon: "💳", name: "Tarjeta", sub: "Débito o crédito", value: "card" as const },
    { icon: "📱", name: "Transferencia", sub: "CoDi / SPEI", value: "transfer" as const },
    ...(isOnline
      ? [{ icon: "📒", name: "Fiado", sub: "Pago a crédito", value: "credit" as const }]
      : []),
  ];

  const handleCustomerSearch = (value: string) => {
    setCustomerQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (value.length > 1) {
        try {
          const results = await creditApi.search(value);
          setCustomerResults(results);
        } catch {
          setCustomerResults([]);
        }
      } else {
        setCustomerResults([]);
      }
    }, 300);
  };

  const handleCreateCustomer = async () => {
    setCreatingCustomer(true);
    try {
      const nuevo = await creditApi.create({ customer_name: customerQuery.toUpperCase() });
      setSelectedCustomer(nuevo);
      setCustomerQuery("");
      setCustomerResults([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear cliente");
    } finally {
      setCreatingCustomer(false);
    }
  };

  const handleConfirm = async () => {
    setError(null);

    if (method === "credit" && !navigator.onLine) {
      setError("No puedes registrar fiado sin conexión. Espera a recuperar internet o cambia el método de pago.");
      return;
    }

    setLoading(true);

    const input: CreateSaleInput = {
      items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
      payment_method: method,
      customer_id: method === "credit" ? selectedCustomer?.id : undefined,
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
          created_at: new Date()
            .toLocaleString("sv-SE", { timeZone: "America/Mexico_City" })
            .replace("T", " "),
          synced: false,
        };
        await pendingSalesDb.add(pendingSale);
        for (const item of items) {
          const cached = await posDb.productsCache.get(item.product_id);
          if (cached) {
            await posDb.productsCache.update(item.product_id, {
              stock: Math.max(0, (cached.stock ?? 0) - item.quantity),
            });
          }
        }
        await refreshCount();
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

  const isCreditMethod = method === "credit";
  const canConfirm =
    !loading &&
    items.length > 0 &&
    (method !== "cash" || receivedNum >= total) &&
    (!isCreditMethod || selectedCustomer !== null);

  const confirmBg = isCreditMethod ? "rgba(255,107,107,0.85)" : "#00e5a0";
  const confirmColor = isCreditMethod ? "#fff" : "#000";
  const confirmLabel = loading
    ? "Procesando..."
    : isCreditMethod
    ? "📒 Confirmar fiado"
    : "✓ Confirmar cobro";

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
            {paymentOptions.map(({ value, icon, name, sub }) => {
              const isCredit = value === "credit";
              const selected = method === value;
              const activeColor = isCredit ? "#ff6b6b" : "#00e5a0";
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setMethod(value);
                    setSelectedCustomer(null);
                    setCustomerQuery("");
                    setCustomerResults([]);
                  }}
                  className="flex items-center gap-4 px-4 py-4 rounded-[14px] border transition-all duration-150 w-full text-left"
                  style={{
                    borderColor: selected ? activeColor : "rgba(255,255,255,0.08)",
                    background: selected
                      ? isCredit
                        ? "rgba(255,107,107,0.06)"
                        : "rgba(0,229,160,0.06)"
                      : "#1a1a1a",
                  }}
                >
                  <span className="text-2xl flex-shrink-0">{icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#f0f0f0]">{name}</p>
                    <p className="text-xs text-[#666] mt-0.5">{sub}</p>
                  </div>
                  <div
                    className="relative w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                    style={{
                      borderColor: selected ? activeColor : "rgba(255,255,255,0.2)",
                      background: selected ? activeColor : "transparent",
                    }}
                  >
                    {selected && <div className="w-2 h-2 rounded-full bg-black" />}
                  </div>
                </button>
              );
            })}
          </div>

          {!isOnline && (
            <p className="text-xs mt-2" style={{ color: "#555" }}>
              Fiado no disponible sin conexión
            </p>
          )}
        </div>

        {/* Credit customer selector */}
        {isCreditMethod && (
          <div
            className="rounded-[14px] px-4 py-4"
            style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: "#666" }}>
              ¿A quién se le fía?
            </p>

            {!selectedCustomer ? (
              <>
                <input
                  type="text"
                  placeholder="Buscar cliente..."
                  value={customerQuery}
                  onChange={(e) => handleCustomerSearch(e.target.value.toUpperCase())}
                  style={{ textTransform: "uppercase" }}
                  className="w-full h-10 bg-[#242424] border border-white/[0.14] rounded-[10px] px-3 text-[#f0f0f0] text-sm focus:outline-none focus:border-[#ff6b6b]"
                />

                {customerResults.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {customerResults.slice(0, 5).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomerQuery("");
                          setCustomerResults([]);
                        }}
                        className="flex justify-between items-center px-3 py-2 rounded-[8px] w-full text-left"
                        style={{ background: "#242424" }}
                      >
                        <span className="text-sm" style={{ color: "#f0f0f0" }}>
                          {c.customer_name}
                        </span>
                        <span className="text-xs" style={{ color: "#ff6b6b" }}>
                          Debe: ${c.balance.toFixed(2)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {customerQuery.length > 2 && customerResults.length === 0 && (
                  <div className="mt-2 flex flex-col gap-2">
                    <p className="text-xs" style={{ color: "#555" }}>
                      Sin resultados
                    </p>
                    <button
                      type="button"
                      onClick={handleCreateCustomer}
                      disabled={creatingCustomer}
                      className="self-start rounded-full px-3 py-1.5 text-xs"
                      style={{ background: "rgba(0,229,160,0.1)", color: "#00e5a0" }}
                    >
                      {creatingCustomer ? "Creando..." : "+ Crear cliente nuevo"}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div
                  className="flex justify-between items-center rounded-[10px] px-3 py-3"
                  style={{ background: "#242424" }}
                >
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#f0f0f0" }}>
                      {selectedCustomer.customer_name}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#ff6b6b" }}>
                      Debe: ${selectedCustomer.balance.toFixed(2)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="text-xs"
                    style={{ color: "#555" }}
                  >
                    Cambiar
                  </button>
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span style={{ color: "#666" }}>Nueva deuda total:</span>
                  <span className="font-bold font-mono" style={{ color: "#ff6b6b" }}>
                    ${(selectedCustomer.balance + total).toFixed(2)}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Cash input */}
        {method === "cash" && (
          <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-[14px] p-4 space-y-3">
            <label className="text-xs font-semibold text-[#666] uppercase tracking-wider block">
              Con cuánto paga
            </label>

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

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666] font-mono">
                $
              </span>
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

            <div
              className="flex justify-between items-center p-3 rounded-[10px] border transition-colors"
              style={{
                background: change !== null ? "rgba(0,229,160,0.08)" : "#242424",
                borderColor:
                  change !== null ? "rgba(0,229,160,0.3)" : "rgba(255,255,255,0.08)",
              }}
            >
              <span className="text-xs uppercase tracking-wider font-semibold text-[#999]">
                Cambio
              </span>
              <span
                className="font-mono font-bold text-xl"
                style={{ color: change !== null ? "#00e5a0" : "#444" }}
              >
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
          className="w-full rounded-[12px] font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          style={{ height: "52px", background: confirmBg, color: confirmColor }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
