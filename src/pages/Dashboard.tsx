import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useAuthStore } from "@/stores/authStore";
import { reportsApi } from "@/lib/reports";
import { salesApi } from "@/lib/sales";
import { expensesApi } from "@/lib/expenses";
import { registersApi } from "@/lib/registers";
import Navbar from "@/components/Navbar";

const roleLabel: Record<string, string> = {
  owner:     "Propietario",
  inventory: "Inventario",
  cashier:   "Cajero",
};

const paymentConfig: Record<string, { label: string; color: string }> = {
  cash:     { label: "Efectivo",      color: "#00e5a0" },
  card:     { label: "Tarjeta",       color: "#74b9ff" },
  transfer: { label: "Transferencia", color: "#ff9f43" },
};

function relativeTime(s: string) {
  const diff = (Date.now() - new Date(s).getTime()) / 1000 / 60;
  if (diff < 1) return "Hace un momento";
  if (diff < 60) return `Hace ${Math.floor(diff)} min`;
  return `Hace ${Math.floor(diff / 60)} h`;
}

function initials(name?: string) {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function pctDiff(today: number, yesterday: number) {
  if (yesterday === 0) return null;
  return Math.round(((today - yesterday) / yesterday) * 100);
}

export default function Dashboard() {
  const { user, store } = useAuthStore();
  const navigate = useNavigate();
  const currentHour = parseInt(
    new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City", hour: "2-digit", hour12: false })
  );

  const { data: report, isLoading } = useQuery({
    queryKey: ["reports", "daily"],
    queryFn: reportsApi.daily,
    refetchInterval: 30000,
  });

  const { data: recentData } = useQuery({
    queryKey: ["sales", "recent"],
    queryFn: () => salesApi.list({ limit: 3 }),
    refetchInterval: 30000,
  });

  const recentSales = recentData?.sales ?? [];

  const salesPct   = report ? pctDiff(report.total_sales, report.yesterday_total ?? 0) : null;
  const countDiff  = report ? report.transaction_count - (report.yesterday_count ?? 0) : null;

  const qualifiesForProfit = user?.role === "owner" &&
    ["recomendado", "oro"].includes(store?.effective_plan ?? "");

  const todayStr    = new Date().toLocaleDateString("sv", { timeZone: "America/Mexico_City" });
  const tomorrowStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toLocaleDateString("sv", { timeZone: "America/Mexico_City" });
  })();

  const { data: currentRegister } = useQuery({
    queryKey: ["registers", "current"],
    queryFn:  registersApi.current,
    enabled:  qualifiesForProfit,
    refetchInterval: 30000,
  });

  const { data: profitData } = useQuery({
    queryKey: ["expenses", "summary", "today", todayStr],
    queryFn: () => expensesApi.summary({ from: todayStr, to: tomorrowStr }),
    enabled: qualifiesForProfit,
    refetchInterval: 30000,
  });

  return (
    <div className="min-h-screen bg-[#0f0f0f] pb-24">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f0f0]">
            Hola, <span className="text-[#00e5a0]">{user?.name?.split(" ")[0] ?? "ahí"}</span>
          </h1>
          <p className="text-sm text-[#666] mt-0.5">
            {store?.name}
            {user?.role ? <> · <span className="text-[#555]">{roleLabel[user.role] ?? user.role}</span></> : null}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={() => navigate("/settings")}
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-[#00e5a0]"
            style={{ background: "rgba(0,229,160,0.1)", border: "1.5px solid rgba(0,229,160,0.25)" }}
          >
            {initials(user?.name)}
          </button>
          {currentRegister && (
            <button
              onClick={() => navigate("/registers")}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
              style={{
                background: "rgba(0,229,160,0.1)",
                border:     "1px solid rgba(0,229,160,0.2)",
                color:      "#00e5a0",
              }}
            >
              <span className="animate-pulse">●</span> Turno activo
            </button>
          )}
        </div>
      </div>

      <div className="px-4 flex flex-col gap-3">
        {/* Skeleton */}
        {isLoading && (
          <>
            {[100, 80, 160, 80, 120].map((h, i) => (
              <div key={i} className="bg-[#1a1a1a] animate-pulse rounded-[14px]" style={{ height: h }} />
            ))}
          </>
        )}

        {report && (
          <>
            {/* Ventas hoy + Ganancia hoy */}
            <div className={qualifiesForProfit ? "grid grid-cols-2 gap-3" : ""}>
              {/* Ventas hoy */}
              <div
                className="rounded-[16px] px-4 py-4"
                style={{ background: "rgba(0,229,160,0.06)", border: "1px solid rgba(0,229,160,0.15)" }}
              >
                <p className="text-xs font-semibold text-[#00e5a0] uppercase tracking-widest mb-1">Ventas hoy</p>
                <p className={`font-bold text-[#f0f0f0] font-mono ${qualifiesForProfit ? "text-2xl" : "text-4xl"}`}>
                  ${report.total_sales.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
                {salesPct !== null && (
                  <p className="text-xs mt-1" style={{ color: salesPct >= 0 ? "#00e5a0" : "#ff6b6b" }}>
                    {salesPct >= 0 ? "↑" : "↓"} {Math.abs(salesPct)}% vs ayer
                  </p>
                )}
                {salesPct === null && report.yesterday_total === 0 && (
                  <p className="text-xs text-[#444] mt-1">Sin datos de ayer</p>
                )}
              </div>

              {/* Ganancia hoy — solo owner plan recomendado/oro */}
              {qualifiesForProfit && (
                <div
                  className="rounded-[16px] px-4 py-4 relative overflow-hidden"
                  style={{
                    background: "linear-gradient(135deg, rgba(0,229,160,0.13) 0%, rgba(0,229,160,0.05) 100%)",
                    border:     "1.5px solid rgba(0,229,160,0.35)",
                    boxShadow:  "0 0 24px rgba(0,229,160,0.08)",
                  }}
                >
                  <div
                    className="absolute -top-4 -right-4 w-20 h-20 rounded-full pointer-events-none"
                    style={{ background: "rgba(0,229,160,0.15)", filter: "blur(16px)" }}
                  />
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "rgba(0,229,160,0.55)" }}>
                    💰 Ganancia neta
                  </p>
                  {profitData ? (
                    <>
                      <p
                        className="text-2xl font-black font-mono leading-tight"
                        style={{ color: "#00e5a0", textShadow: "0 0 16px rgba(0,229,160,0.45)" }}
                      >
                        ${profitData.profit.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </p>
                    </>
                  ) : (
                    <p className="text-2xl font-black font-mono text-[#2a2a2a] leading-tight">$—</p>
                  )}
                </div>
              )}
            </div>

            {/* Transacciones + Ticket prom */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-[14px] px-4 py-4">
                <p className="text-xs text-[#666] uppercase tracking-wider mb-1">Transacciones</p>
                <p className="text-2xl font-bold text-[#f0f0f0] font-mono">{report.transaction_count}</p>
                {countDiff !== null && countDiff !== 0 && (
                  <p className="text-xs mt-1" style={{ color: countDiff > 0 ? "#00e5a0" : "#ff6b6b" }}>
                    {countDiff > 0 ? `↑ ${countDiff}` : `↓ ${Math.abs(countDiff)}`} más que ayer
                  </p>
                )}
                {countDiff === 0 && (
                  <p className="text-xs text-[#444] mt-1">Igual que ayer</p>
                )}
              </div>
              <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-[14px] px-4 py-4">
                <p className="text-xs text-[#666] uppercase tracking-wider mb-1">Ticket prom.</p>
                <p className="text-2xl font-bold text-[#f0f0f0] font-mono">
                  ${Math.round(report.avg_ticket).toLocaleString("es-MX")}
                </p>
                <p className="text-xs text-[#444] mt-1">por venta</p>
              </div>
            </div>

            {/* Gráfica por hora */}
            <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-[14px] px-4 pt-4 pb-2">
              <div className="flex justify-between items-center mb-3">
                <p className="text-xs font-semibold text-[#666] uppercase tracking-wider">Ventas por hora</p>
                <button onClick={() => navigate("/reports")} className="text-xs font-semibold text-[#00e5a0]">
                  Ver todo
                </button>
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={report.sales_by_hour ?? []} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="hour"
                    tick={{ fill: "#444", fontSize: 10 }}
                    tickFormatter={(h) => h % 2 === 0 ? h + "h" : ""}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      background: "#242424",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      color: "#f0f0f0",
                      fontSize: "12px",
                    }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => ["$" + (typeof v === "number" ? v.toFixed(2) : v), "Ventas"]}
                    labelFormatter={(h) => h + ":00 hrs"}
                  />
                  <Bar dataKey="amount" radius={[3, 3, 0, 0]} maxBarSize={18}>
                    {(report.sales_by_hour ?? []).map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.hour === currentHour ? "#00e5a0" : "rgba(0,229,160,0.25)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Stock bajo */}
            {(report.low_stock_alerts ?? []).length > 0 && (
              <button
                onClick={() => navigate("/inventory")}
                className="w-full rounded-[14px] px-4 py-3 flex items-start gap-3 text-left"
                style={{ background: "rgba(255,159,67,0.08)", border: "1px solid rgba(255,159,67,0.2)" }}
              >
                <span className="text-lg mt-0.5 flex-shrink-0">⚠️</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#ff9f43]">
                    {report.low_stock_alerts.length} producto{report.low_stock_alerts.length !== 1 ? "s" : ""} con stock bajo
                  </p>
                  <p className="text-xs text-[#999] mt-0.5 truncate">
                    {report.low_stock_alerts.slice(0, 3).map((a) => `${a.name} (${a.stock} uds)`).join(" · ")}
                    {report.low_stock_alerts.length > 3 ? "..." : ""}
                  </p>
                </div>
              </button>
            )}
          </>
        )}

        {/* Últimas ventas */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <p className="text-xs font-semibold text-[#666] uppercase tracking-wider">Últimas ventas</p>
            <button onClick={() => navigate("/reports")} className="text-xs font-semibold text-[#00e5a0]">
              Ver historial
            </button>
          </div>
          {recentSales.length === 0 ? (
            <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-[14px] p-4 text-center text-sm text-[#444]">
              Sin ventas hoy
            </div>
          ) : (
            <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-[14px] overflow-hidden">
              {recentSales.map((sale, i) => {
                const cfg = paymentConfig[sale.payment_method] ?? { label: sale.payment_method, color: "#666" };
                return (
                  <div
                    key={sale.id}
                    className="px-4 py-3 flex items-center gap-3"
                    style={i < recentSales.length - 1 ? { borderBottom: "1px solid rgba(255,255,255,0.06)" } : {}}
                  >
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#f0f0f0]">
                        Venta #{sale.id.slice(0, 6).toUpperCase()}
                      </p>
                      <p className="text-xs text-[#666] mt-0.5">
                        {relativeTime(sale.created_at)} · {cfg.label}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-[#00e5a0] font-mono">
                      ${sale.total.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Trial vencido */}
        {store && !store.is_on_trial && store.plan === 'free' && (
          <div
            className="rounded-[14px] px-5 py-4"
            style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.2)" }}
          >
            <p className="text-sm font-semibold" style={{ color: "#ff6b6b" }}>⚠️ Tu prueba ha vencido</p>
            <p className="text-xs mt-1" style={{ color: "#999" }}>
              Algunas funciones están limitadas. Elige un plan para seguir vendiendo sin interrupciones.
            </p>
            <button
              onClick={() => navigate("/subscription")}
              className="mt-3 px-4 py-2 rounded-full text-sm font-semibold"
              style={{
                background: "rgba(255,107,107,0.15)",
                border: "1px solid rgba(255,107,107,0.3)",
                color: "#ff6b6b",
              }}
            >
              Ver planes →
            </button>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={() => navigate("/scanner")}
          className="w-full rounded-[14px] text-black font-bold text-base flex items-center justify-center gap-2"
          style={{ height: "56px", background: "#00e5a0" }}
        >
          🛒 Iniciar nueva venta
        </button>
      </div>

      <Navbar />
    </div>
  );
}
