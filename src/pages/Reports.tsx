import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { reportsApi } from "@/lib/reports";
import type { DailyReport } from "@/types/report";
import Navbar from "@/components/Navbar";
import { useAuthStore } from "@/stores/authStore";
import { apiFetch } from "@/lib/api";

type Tab = "daily" | "weekly" | "monthly" | "range";

const TABS: { key: Tab; label: string }[] = [
  { key: "daily",   label: "Hoy" },
  { key: "weekly",  label: "Esta semana" },
  { key: "monthly", label: "Este mes" },
  { key: "range",   label: "Seleccionar fechas" },
];

const METHOD_CFG: Record<string, { label: string; color: string }> = {
  cash:     { label: "Efectivo",      color: "#00e5a0" },
  card:     { label: "Tarjeta",       color: "#74b9ff" },
  transfer: { label: "Transferencia", color: "#ff9f43" },
};

const RANK_COLORS = ["#00e5a0", "#74b9ff", "#ff9f43", "#555", "#555"];

function pctDiff(a: number, b: number) {
  if (b === 0) return null;
  return Math.round(((a - b) / b) * 100);
}

function getPeriodComparison(tab: Exclude<Tab, "range">, report: DailyReport & Record<string, number>) {
  if (tab === "daily") {
    return { prev: report.yesterday_total ?? 0, prevCount: report.yesterday_count ?? 0, label: "ayer" };
  }
  if (tab === "weekly") {
    return { prev: report.last_week_total ?? 0, prevCount: report.last_week_count ?? 0, label: "sem. ant." };
  }
  return { prev: report.last_period_total ?? 0, prevCount: report.last_period_count ?? 0, label: "mes ant." };
}

function CashierDailyView() {
  const { data: report, isLoading } = useQuery({
    queryKey: ["reports", "daily"],
    queryFn: reportsApi.daily,
  });
  const r = report as (DailyReport & Record<string, number>) | undefined;

  return (
    <div className="min-h-screen bg-[#0f0f0f] pb-24">
      <div className="px-4 pt-5 pb-3">
        <h1 className="text-2xl font-bold text-[#f0f0f0] mb-4">Reportes</h1>
      </div>
      <div className="px-4 pb-4">
        {isLoading && (
          <div className="bg-[#1a1a1a] animate-pulse rounded-[16px]" style={{ height: 160 }} />
        )}
        {r && (
          <div className="bg-[#1a1a1a] rounded-[16px] p-5 text-center">
            <p className="text-xs text-[#666] uppercase tracking-widest mb-3">Tus ventas de hoy</p>
            <p className="text-4xl font-bold font-mono" style={{ color: "#00e5a0" }}>
              ${r.total_sales.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <p className="text-xs text-[#666] uppercase tracking-wider mb-1">Transacciones</p>
                <p className="text-xl font-bold text-[#f0f0f0]">{r.transaction_count}</p>
              </div>
              <div>
                <p className="text-xs text-[#666] uppercase tracking-wider mb-1">Ticket prom.</p>
                <p className="text-xl font-bold font-mono text-[#f0f0f0]">
                  ${r.avg_ticket.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      <Navbar />
    </div>
  );
}

export default function Reports() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<Tab>("daily");
  const today = new Date().toISOString().slice(0, 10);
  const [rangeStart, setRangeStart] = useState(today);
  const [rangeEnd, setRangeEnd] = useState(today);
  const [appliedStart, setAppliedStart] = useState(today);
  const [appliedEnd, setAppliedEnd] = useState(today);

  if (user?.role === "cashier") {
    return <CashierDailyView />;
  }

  const queryFn =
    tab === "daily"   ? reportsApi.daily :
    tab === "weekly"  ? reportsApi.weekly :
    tab === "monthly" ? reportsApi.monthly :
    () => reportsApi.range(appliedStart, appliedEnd);

  const { data: report, isLoading } = useQuery({
    queryKey: tab === "range" ? ["reports", "range", appliedStart, appliedEnd] : ["reports", tab],
    queryFn,
    enabled: tab !== "range" || (!!appliedStart && !!appliedEnd),
  });

  const insightPeriod = tab === "range" ? null : tab;
  const { data: insightData, isLoading: insightLoading } = useQuery({
    queryKey: ["reports", "insights", insightPeriod],
    queryFn: () => apiFetch<{ insight: string | null; available_after?: string }>(`/api/v1/reports/insights?period=${insightPeriod}`),
    enabled: !!insightPeriod,
    staleTime: 5 * 60 * 1000,
  });

  const r = report as (DailyReport & Record<string, number>) | undefined;
  const comparison = (r && tab !== "range") ? getPeriodComparison(tab, r) : null;
  const pct = comparison ? pctDiff(r!.total_sales, comparison.prev) : null;

  const ingresosLabel =
    tab === "daily"   ? "INGRESOS HOY" :
    tab === "weekly"  ? "INGRESOS ESTA SEMANA" :
    tab === "monthly" ? "INGRESOS ESTE MES" :
    `INGRESOS ${appliedStart} — ${appliedEnd}`;

  return (
    <div className="min-h-screen bg-[#0f0f0f] pb-24">
      <div className="px-4 pt-5 pb-3">
        <h1 className="text-2xl font-bold text-[#f0f0f0] mb-4">Reportes</h1>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-4 py-1.5 rounded-full text-sm font-medium transition-all flex-shrink-0"
              style={{
                background: tab === t.key ? "rgba(0,229,160,0.12)" : "transparent",
                border: tab === t.key ? "1px solid rgba(0,229,160,0.35)" : "1px solid rgba(255,255,255,0.1)",
                color: tab === t.key ? "#00e5a0" : "#666",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "range" && (
          <div className="mt-3 flex gap-2 items-end">
            <div className="flex-1">
              <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Desde</p>
              <input
                type="date"
                value={rangeStart}
                max={rangeEnd}
                onChange={(e) => setRangeStart(e.target.value)}
                className="w-full rounded-[10px] px-3 py-2 text-sm text-[#f0f0f0] outline-none"
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Hasta</p>
              <input
                type="date"
                value={rangeEnd}
                min={rangeStart}
                max={today}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="w-full rounded-[10px] px-3 py-2 text-sm text-[#f0f0f0] outline-none"
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>
            <button
              onClick={() => { setAppliedStart(rangeStart); setAppliedEnd(rangeEnd); }}
              className="px-4 py-2 rounded-[10px] text-sm font-semibold flex-shrink-0"
              style={{ background: "rgba(0,229,160,0.15)", border: "1px solid rgba(0,229,160,0.35)", color: "#00e5a0" }}
            >
              Ver
            </button>
          </div>
        )}
      </div>

      <div className="px-4 flex flex-col gap-3 pb-4">
        {isLoading && (
          <>
            {[100, 80, 220, 180].map((h, i) => (
              <div key={i} className="bg-[#1a1a1a] animate-pulse rounded-[14px]" style={{ height: h }} />
            ))}
          </>
        )}

        {r && (
          <>
            {/* Ingresos */}
            <div className="grid grid-cols-2 gap-3">
              {/* Ingresos */}
              <div
                className="rounded-[16px] px-4 py-4"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <p className="text-[10px] font-semibold text-[#555] uppercase tracking-widest mb-1">{ingresosLabel}</p>
                <p className="text-2xl font-bold text-[#f0f0f0] font-mono leading-tight">
                  ${r.total_sales.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
                {pct !== null ? (
                  <p className="text-xs mt-1.5 font-medium" style={{ color: pct >= 0 ? "#00e5a0" : "#ff6b6b" }}>
                    {pct >= 0 ? "↑" : "↓"} {Math.abs(pct)}% vs {comparison!.label}
                  </p>
                ) : (
                  <p className="text-[10px] text-[#333] mt-1.5">Sin datos previos</p>
                )}
              </div>

              {/* IA insight */}
              {insightPeriod && (
                <div
                  className="rounded-[16px] px-4 py-4"
                  style={{ background: "rgba(116,185,255,0.06)", border: "1px solid rgba(116,185,255,0.2)" }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#74b9ff" }}>
                    ✨ Análisis de tu negocio
                  </p>
                  {insightLoading ? (
                    <div className="flex flex-col gap-1.5">
                      {[80, 65, 75].map((w, i) => (
                        <div key={i} className="h-2 rounded-full animate-pulse" style={{ width: `${w}%`, background: "rgba(116,185,255,0.2)" }} />
                      ))}
                    </div>
                  ) : insightData?.insight === null ? (
                    <p className="text-[11px] leading-snug" style={{ color: "rgba(116,185,255,0.45)" }}>
                      Disponible después de las 6 pm
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {(insightData?.insight ?? "").split("\n").filter(Boolean).map((line, i) => (
                        <p key={i} className="text-[11px] leading-snug" style={{ color: "#cce4ff" }}>
                          • {line}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Ganancia bruta + Ganancia neta */}
            <div className="grid grid-cols-2 gap-3">
              {/* Ganancia bruta */}
              <div
                className="rounded-[16px] px-4 py-4"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <p className="text-[10px] font-semibold text-[#555] uppercase tracking-widest mb-1">Ganancia bruta</p>
                {r.gross_profit > 0 ? (
                  <>
                    <p className="text-2xl font-bold text-[#f0f0f0] font-mono leading-tight">
                      ${r.gross_profit.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-[10px] text-[#555] mt-1.5">precio − costo</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold font-mono text-[#2a2a2a] leading-tight">$0</p>
                    <p className="text-[10px] text-[#333] mt-1.5">Agrega costos</p>
                  </>
                )}
              </div>

              {/* Ganancia neta */}
              <div
                className="rounded-[16px] px-4 py-4 relative overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, rgba(0,229,160,0.13) 0%, rgba(0,229,160,0.05) 100%)",
                  border: "1.5px solid rgba(0,229,160,0.35)",
                  boxShadow: "0 0 24px rgba(0,229,160,0.08)",
                }}
              >
                <div
                  className="absolute -top-4 -right-4 w-20 h-20 rounded-full pointer-events-none"
                  style={{ background: "rgba(0,229,160,0.15)", filter: "blur(16px)" }}
                />
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "rgba(0,229,160,0.55)" }}>
                  💰 Ganancia neta
                </p>
                {r.gross_profit > 0 ? (
                  <>
                    <p
                      className="text-2xl font-black font-mono leading-tight"
                      style={{ color: "#00e5a0", textShadow: "0 0 16px rgba(0,229,160,0.45)" }}
                    >
                      ${(r.net_profit ?? r.gross_profit).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                    {(r.total_expenses ?? 0) > 0 && (
                      <p className="text-[10px] mt-1" style={{ color: "rgba(0,229,160,0.45)" }}>
                        −${(r.total_expenses as number).toLocaleString("es-MX", { minimumFractionDigits: 0 })} gastos
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-black font-mono text-[#2a2a2a] leading-tight">$0</p>
                    <p className="text-[10px] text-[#333] mt-1.5">Agrega costos</p>
                  </>
                )}
              </div>
            </div>

            {/* Ventas + Ticket */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-[14px] px-4 py-4">
                <p className="text-xs text-[#666] uppercase tracking-wider mb-1">Ventas</p>
                <p className="text-2xl font-bold text-[#f0f0f0] font-mono">{r.transaction_count}</p>
              </div>
              <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-[14px] px-4 py-4">
                <p className="text-xs text-[#666] uppercase tracking-wider mb-1">Ticket prom.</p>
                <p className="text-2xl font-bold text-[#f0f0f0] font-mono">
                  ${Math.round(r.avg_ticket).toLocaleString("es-MX")}
                </p>
              </div>
            </div>

            {/* Top productos */}
            {r.top_products.length > 0 && (
              <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-[14px] px-4 py-4">
                <p className="text-xs font-semibold text-[#666] uppercase tracking-wider mb-4">
                  Top productos {tab === "daily" ? "del día" : tab === "weekly" ? "de la semana" : tab === "monthly" ? "del mes" : "del período"}
                </p>
                {r.top_products.map((p, i) => {
                  const maxUnits = r.top_products[0].units_sold;
                  const pct = maxUnits > 0 ? (p.units_sold / maxUnits) * 100 : 0;
                  const color = RANK_COLORS[i] ?? "#555";
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-3 py-3"
                      style={i < r.top_products.length - 1 ? { borderBottom: "1px solid rgba(255,255,255,0.05)" } : {}}
                    >
                      <span className="text-xs text-[#444] font-mono w-6 flex-shrink-0">#{i + 1}</span>
                      <span
                        className="w-8 h-8 rounded-[8px] flex items-center justify-center text-base flex-shrink-0"
                        style={{ background: `${color}18` }}
                      >
                        📦
                      </span>
                      <span className="text-sm text-[#f0f0f0] flex-1 truncate">{p.product_name}</span>
                      <div className="w-20 h-1 rounded-full flex-shrink-0" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <span className="text-xs font-mono flex-shrink-0" style={{ color, minWidth: 32, textAlign: "right" }}>
                        {p.units_sold}u
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Métodos de pago */}
            {r.payment_methods.length > 0 && (
              <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-[14px] px-4 py-4">
                <p className="text-xs font-semibold text-[#666] uppercase tracking-wider mb-3">
                  Por método de pago
                </p>
                {r.payment_methods.map((pm, i) => {
                  const cfg = METHOD_CFG[pm.method] ?? { label: pm.method, color: "#666" };
                  const share = r.total_sales > 0 ? Math.round((pm.amount / r.total_sales) * 100) : 0;
                  return (
                    <div
                      key={pm.method}
                      className="py-3"
                      style={i < r.payment_methods.length - 1 ? { borderBottom: "1px solid rgba(255,255,255,0.05)" } : {}}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                        <span className="text-sm text-[#f0f0f0] flex-1">{cfg.label}</span>
                        <span className="text-xs text-[#555] font-mono">{pm.count} ventas</span>
                        <span className="text-sm font-bold font-mono" style={{ color: cfg.color }}>
                          ${pm.amount.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      <div className="h-1 rounded-full w-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full" style={{ width: `${share}%`, background: cfg.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Stock bajo */}
            {r.low_stock_alerts.length > 0 && (
              <div
                className="rounded-[14px] px-4 py-4"
                style={{ background: "rgba(255,159,67,0.06)", border: "1px solid rgba(255,159,67,0.2)" }}
              >
                <p className="text-xs font-semibold text-[#ff9f43] uppercase tracking-wider mb-3">
                  ⚠ Stock bajo
                </p>
                {r.low_stock_alerts.map((a, i) => (
                  <div
                    key={a.id}
                    className="flex justify-between py-2"
                    style={i < r.low_stock_alerts.length - 1 ? { borderBottom: "1px solid rgba(255,255,255,0.04)" } : {}}
                  >
                    <span className="text-sm text-[#f0f0f0] truncate flex-1 mr-4">{a.name}</span>
                    <span className="text-xs text-[#ff9f43] font-mono flex-shrink-0">
                      {a.stock}/{a.low_stock_threshold} uds
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

      </div>

      <Navbar />
    </div>
  );
}
