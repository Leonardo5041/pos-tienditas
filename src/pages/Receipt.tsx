import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import type { Sale } from "@/types/sale";


type ReceiptState = { sale: Sale; offline: boolean } | null;

const paymentLabels: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
};

export default function Receipt() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const store = useAuthStore((s) => s.store);

  const state = location.state as ReceiptState;
  if (!state?.sale) return <Navigate to="/dashboard" replace />;

  const { sale, offline } = state;
  const _saleDate = new Date(sale.created_at);
  const time = _saleDate.toLocaleString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: true });
  const dateStr = _saleDate.toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", year: "numeric" });
  const shortId = sale.id.slice(0, 8).toUpperCase();
  const payLabel = paymentLabels[sale.payment_method] ?? sale.payment_method;

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
      {/* Status header */}
      <div
        className="px-4 py-3 text-center text-sm font-semibold"
        style={
          offline
            ? {
                background: "rgba(255,159,67,0.1)",
                borderBottom: "1px solid rgba(255,159,67,0.2)",
                color: "#ff9f43",
              }
            : {
                background: "rgba(0,229,160,0.08)",
                borderBottom: "1px solid rgba(0,229,160,0.15)",
                color: "#00e5a0",
              }
        }
      >
        {offline ? "📴 Guardada sin conexión" : "✓ Venta completada"}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col items-center gap-5">
        {/* Icon */}
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto text-4xl"
          style={
            offline
              ? {
                  background: "rgba(255,159,67,0.1)",
                  border: "1.5px solid rgba(255,159,67,0.25)",
                }
              : {
                  background: "rgba(0,229,160,0.1)",
                  border: "1.5px solid rgba(0,229,160,0.25)",
                }
          }
        >
          {offline ? (
            "📴"
          ) : (
            <span style={{ color: "#00e5a0", fontSize: "36px", lineHeight: 1 }}>✓</span>
          )}
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-xl font-bold text-[#f0f0f0]">
            {offline ? "Venta guardada" : "¡Cobro exitoso!"}
          </h1>
          <p className="text-sm text-[#666] mt-1 text-center max-w-[220px]">
            {offline
              ? "Se sincronizará cuando haya conexión"
              : `${payLabel} · ${time}`}
          </p>
        </div>

        {/* Receipt card */}
        <div className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-[16px] overflow-hidden">
          <div
            className="px-4 py-3 flex justify-between text-xs text-[#666]"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            <span>Detalle de la venta</span>
            <span>Ref: #{shortId}</span>
          </div>

          <div className="px-4">
            {sale.items.map((item, i) => (
              <div
                key={i}
                className="py-3 flex justify-between items-start"
                style={
                  i < sale.items.length - 1
                    ? { borderBottom: "1px solid rgba(255,255,255,0.06)" }
                    : {}
                }
              >
                <div>
                  <p className="text-sm font-medium text-[#f0f0f0]">{item.product_name}</p>
                  <p className="text-xs text-[#666] mt-0.5">x{item.quantity}</p>
                </div>
                <span className="text-sm font-bold text-[#f0f0f0] font-mono">
                  ${(item.subtotal ?? item.unit_price * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div
            className="px-4 py-3 flex justify-between items-center"
            style={{ borderTop: "1.5px solid rgba(255,255,255,0.1)" }}
          >
            <span className="text-sm font-semibold text-[#999]">Total</span>
            <span className="text-xl font-bold text-[#00e5a0] font-mono">
              ${sale.total.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Meta info */}
        <div className="text-center text-xs text-[#444]" style={{ lineHeight: 1.8 }}>
          {store?.name && <div>{store.name}</div>}
          <div>
            {dateStr} · {time}
          </div>
          {user?.name && <div>Cajero: {user.name}</div>}
        </div>

        {/* Action buttons */}
        <div className="w-full flex flex-col gap-2.5 pb-8">
          <button
            onClick={() => navigate("/scanner")}
            className="w-full h-12 rounded-[12px] bg-[#00e5a0] text-black font-bold"
          >
            + Nueva venta
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className="w-full h-11 rounded-[12px] text-[#666] font-medium"
            style={{ border: "1px solid rgba(255,255,255,0.1)" }}
          >
            Ir al inicio
          </button>
        </div>
      </div>

      {/* Ticket térmico — solo visible al imprimir */}
      <div id="thermal-receipt" style={{ display: "none" }}>
        <div className="r-center r-bold" style={{ fontSize: 13 }}>{store?.name ?? "Mi Tienda"}</div>
        <div className="r-center r-muted">{dateStr} {time}</div>
        <div className="r-center r-muted">Cajero: {user?.name ?? "—"}</div>
        <div className="r-line" />

        {sale.items.map((item, i) => (
          <div key={i}>
            <div className="r-bold">{item.product_name}</div>
            <div className="r-row">
              <span className="r-muted">x{item.quantity} × ${item.unit_price.toFixed(2)}</span>
              <span>${(item.subtotal ?? item.unit_price * item.quantity).toFixed(2)}</span>
            </div>
          </div>
        ))}

        <div className="r-line" />
        <div className="r-row r-large">
          <span>TOTAL</span>
          <span>${sale.total.toFixed(2)}</span>
        </div>
        <div className="r-row r-muted" style={{ marginTop: 2 }}>
          <span>Forma de pago</span>
          <span>{payLabel}</span>
        </div>
        <div className="r-line" />
        <div className="r-center r-muted">Ref: #{shortId}</div>
        <div className="r-center r-muted" style={{ marginTop: 4 }}>¡Gracias por su compra!</div>
      </div>
    </div>
  );
}
