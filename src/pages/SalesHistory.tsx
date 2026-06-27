import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { salesApi } from "@/lib/sales";
import { usersApi } from "@/lib/users";
import Modal from "@/components/Modal";
import type { Sale } from "@/types/sale";

const LIMIT = 20;

const METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
};

const METHOD_COLORS: Record<string, string> = {
  cash: "#00e5a0",
  card: "#74b9ff",
  transfer: "#ff9f43",
};

function localDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDateRange(range: "today" | "week" | "month") {
  const now = new Date();
  const today = localDate(now);
  if (range === "today") return { from: today, to: today };
  const d = new Date(now);
  d.setDate(d.getDate() - (range === "week" ? 7 : 30));
  return { from: localDate(d), to: today };
}

export default function SalesHistory() {
  const navigate = useNavigate();
  const { user, store } = useAuthStore();
  const isOwner = user?.role === "owner";
  const isPro = ["recomendado", "oro"].includes(store?.effective_plan ?? "");

  const [dateRange, setDateRange] = useState<"today" | "week" | "month">("today");
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedCashier, setSelectedCashier] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("");
  const [page, setPage] = useState(0);
  const [refSearch, setRefSearch] = useState("");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const { from, to } =
    showCustomRange && customFrom && customTo
      ? { from: customFrom, to: customTo }
      : getDateRange(dateRange);

  const { data, isLoading } = useQuery({
    queryKey: ["sales", from, to, selectedCashier, selectedMethod, page],
    queryFn: () =>
      salesApi.list({
        from,
        to,
        limit: LIMIT,
        offset: page * LIMIT,
        cashier_id: selectedCashier || undefined,
        payment_method: selectedMethod || undefined,
      }),
  });

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => usersApi.list(),
    enabled: isOwner && isPro,
  });

  const { data: detailData } = useQuery({
    queryKey: ["sale", selectedSale?.id],
    queryFn: () => salesApi.get(selectedSale!.id),
    enabled: !!selectedSale?.id,
  });

  const allSales = data?.sales ?? [];
  const sales = refSearch
    ? allSales.filter((s) => s.id.toUpperCase().startsWith(refSearch.toUpperCase()))
    : allSales;
  const totalCount = data?.total_count ?? 0;
  const totalAmount = data?.total_amount ?? 0;
  const detail = detailData ?? selectedSale;

  function handleSelectSale(sale: Sale) {
    setSelectedSale(sale);
    setShowDetail(true);
  }

  function handleCloseDetail() {
    setShowDetail(false);
    setSelectedSale(null);
  }

  function handleRangeTab(range: "today" | "week" | "month") {
    setDateRange(range);
    setShowCustomRange(false);
    setPage(0);
  }

  const tabStyle = (active: boolean, color = "#00e5a0") =>
    ({
      padding: "8px 16px",
      borderRadius: "999px",
      fontSize: "13px",
      border: active ? `1px solid ${color}44` : "1px solid #2a2a2a",
      background: active ? `${color}1a` : "#1a1a1a",
      color: active ? color : "#555",
      cursor: "pointer",
      whiteSpace: "nowrap" as const,
      flexShrink: 0,
    } as React.CSSProperties);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0f0f",
        padding: "20px 16px 100px",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            background: "#1a1a1a",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <ChevronLeft size={18} color="#888" />
        </button>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#f0f0f0", margin: 0 }}>
          Historial de ventas
        </h1>
      </div>

      {/* Date range tabs */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "16px",
          overflowX: "auto",
          paddingBottom: "2px",
        }}
      >
        {(["today", "week", "month"] as const).map((r) => (
          <button
            key={r}
            style={tabStyle(!showCustomRange && dateRange === r)}
            onClick={() => handleRangeTab(r)}
          >
            {r === "today" ? "Hoy" : r === "week" ? "7 días" : "30 días"}
          </button>
        ))}
        {isPro && (
          <button
            style={tabStyle(showCustomRange, "#f9ca24")}
            onClick={() => {
              setShowCustomRange(true);
              setPage(0);
            }}
          >
            Personalizado
          </button>
        )}
      </div>

      {/* Custom range pickers */}
      {isPro && showCustomRange && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => { setCustomFrom(e.target.value); setPage(0); }}
            style={{
              flex: 1,
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: "10px",
              padding: "0 12px",
              height: "40px",
              color: "#f0f0f0",
              fontSize: "13px",
            }}
          />
          <input
            type="date"
            value={customTo}
            onChange={(e) => { setCustomTo(e.target.value); setPage(0); }}
            style={{
              flex: 1,
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: "10px",
              padding: "0 12px",
              height: "40px",
              color: "#f0f0f0",
              fontSize: "13px",
            }}
          />
        </div>
      )}

      {/* Advanced filters (pro + owner) */}
      {isPro && isOwner && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <select
            value={selectedCashier}
            onChange={(e) => { setSelectedCashier(e.target.value); setPage(0); }}
            style={{
              flex: 1,
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: "10px",
              padding: "0 12px",
              height: "40px",
              color: selectedCashier ? "#f0f0f0" : "#555",
              fontSize: "13px",
            }}
          >
            <option value="">Todos los cajeros</option>
            {(usersData ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select
            value={selectedMethod}
            onChange={(e) => { setSelectedMethod(e.target.value); setPage(0); }}
            style={{
              flex: 1,
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: "10px",
              padding: "0 12px",
              height: "40px",
              color: selectedMethod ? "#f0f0f0" : "#555",
              fontSize: "13px",
            }}
          >
            <option value="">Todos los métodos</option>
            <option value="cash">Efectivo</option>
            <option value="card">Tarjeta</option>
            <option value="transfer">Transferencia</option>
          </select>
        </div>
      )}

      {/* Ref search */}
      <input
        type="text"
        value={refSearch}
        onChange={(e) => setRefSearch(e.target.value.toUpperCase())}
        placeholder="Buscar por referencia..."
        style={{
          width: "100%",
          background: "#1a1a1a",
          border: "1px solid #2a2a2a",
          borderRadius: "10px",
          padding: "0 14px",
          height: "40px",
          color: "#f0f0f0",
          fontSize: "13px",
          marginBottom: "12px",
          boxSizing: "border-box",
          fontFamily: "monospace",
        }}
      />

      {/* Summary */}
      <div
        style={{
          background: "rgba(0,229,160,0.06)",
          border: "1px solid rgba(0,229,160,0.15)",
          borderRadius: "14px",
          padding: "16px 20px",
          marginBottom: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: "13px", color: "#666", marginBottom: "4px" }}>
            {totalCount} venta{totalCount !== 1 ? "s" : ""}
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#f0f0f0", fontFamily: "monospace" }}>
            ${totalAmount.toFixed(2)}
          </div>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: "72px",
                background: "#1a1a1a",
                borderRadius: "12px",
                animation: "pulse 1.5s ease-in-out infinite",
                opacity: 0.5,
              }}
            />
          ))}
        </div>
      ) : sales.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: "64px", paddingBottom: "64px" }}>
          <div style={{ fontSize: "48px", opacity: 0.2, marginBottom: "12px" }}>🧾</div>
          <div style={{ fontSize: "14px", color: "#555" }}>Sin ventas en este período</div>
        </div>
      ) : (
        <div>
          {sales.map((sale) => (
            <div
              key={sale.id}
              onClick={() => handleSelectSale(sale)}
              style={{
                background: "#1a1a1a",
                border: "1px solid #222",
                borderRadius: "12px",
                padding: "12px 16px",
                marginBottom: "8px",
                cursor: "pointer",
                transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)")
              }
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#222")}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#f0f0f0",
                      fontFamily: "monospace",
                    }}
                  >
                    #{sale.id.slice(0, 8).toUpperCase()}
                  </div>
                  <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                    {dateRange !== "today" && (
                      <span>
                        {new Date(sale.created_at).toLocaleDateString("es-MX", {
                          timeZone: "America/Mexico_City",
                          day: "2-digit",
                          month: "short",
                        })}{" · "}
                      </span>
                    )}
                    {new Date(sale.created_at).toLocaleTimeString("es-MX", {
                      timeZone: "America/Mexico_City",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: 700,
                    color: "#f0f0f0",
                    fontFamily: "monospace",
                  }}
                >
                  ${sale.total.toFixed(2)}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginTop: "8px",
                }}
              >
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: METHOD_COLORS[sale.payment_method] ?? "#888",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: "12px", color: "#666" }}>
                  {METHOD_LABELS[sale.payment_method] ?? sale.payment_method}
                </span>
                {isOwner && sale.cashier_name && (
                  <>
                    <span style={{ color: "#333", fontSize: "12px" }}>·</span>
                    <span style={{ fontSize: "12px", color: "#555" }}>{sale.cashier_name}</span>
                  </>
                )}
                {sale.synced_offline && (
                  <>
                    <span style={{ color: "#333", fontSize: "12px" }}>·</span>
                    <span style={{ fontSize: "12px", color: "#ff9f43" }}>Offline</span>
                  </>
                )}
                <ChevronRight size={14} color="#333" style={{ marginLeft: "auto" }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalCount > LIMIT && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "16px",
            padding: "0 4px",
          }}
        >
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              color: page === 0 ? "#333" : "#888",
              fontSize: "13px",
              cursor: page === 0 ? "not-allowed" : "pointer",
            }}
          >
            ← Anterior
          </button>
          <span style={{ fontSize: "12px", color: "#555" }}>
            {page + 1} de {Math.ceil(totalCount / LIMIT)}
          </span>
          <button
            disabled={(page + 1) * LIMIT >= totalCount}
            onClick={() => setPage((p) => p + 1)}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              color: (page + 1) * LIMIT >= totalCount ? "#333" : "#888",
              fontSize: "13px",
              cursor: (page + 1) * LIMIT >= totalCount ? "not-allowed" : "pointer",
            }}
          >
            Siguiente →
          </button>
        </div>
      )}

      {/* Detail Modal */}
      <Modal
        isOpen={showDetail}
        onClose={handleCloseDetail}
        title={`Venta #${selectedSale?.id.slice(0, 8).toUpperCase() ?? ""}`}
        maxWidth={440}
      >
        {detail && (
          <div>
            {/* Sale info grid */}
            <div
              style={{
                background: "#242424",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "16px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
              }}
            >
              <div>
                <div style={{ fontSize: "10px", color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                  Fecha
                </div>
                <div style={{ fontSize: "13px", color: "#f0f0f0" }}>
                  {new Date(detail.created_at).toLocaleDateString("es-MX", {
                    timeZone: "America/Mexico_City",
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "10px", color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                  Hora
                </div>
                <div style={{ fontSize: "13px", color: "#f0f0f0" }}>
                  {new Date(detail.created_at).toLocaleTimeString("es-MX", {
                    timeZone: "America/Mexico_City",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              {detail.cashier_name && (
                <div>
                  <div style={{ fontSize: "10px", color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                    Cajero
                  </div>
                  <div style={{ fontSize: "13px", color: "#f0f0f0" }}>{detail.cashier_name}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: "10px", color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                  Método
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: METHOD_COLORS[detail.payment_method] ?? "#888",
                    }}
                  />
                  <span style={{ fontSize: "13px", color: "#f0f0f0" }}>
                    {METHOD_LABELS[detail.payment_method] ?? detail.payment_method}
                  </span>
                </div>
              </div>
              {detail.synced_offline && (
                <div>
                  <div style={{ fontSize: "10px", color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                    Origen
                  </div>
                  <div style={{ fontSize: "13px", color: "#ff9f43" }}>📴 Offline</div>
                </div>
              )}
            </div>

            {/* Items */}
            <div
              style={{
                fontSize: "10px",
                color: "#666",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "8px",
              }}
            >
              Productos
            </div>
            <div
              style={{
                background: "#1a1a1a",
                borderRadius: "12px",
                overflow: "hidden",
                marginBottom: "12px",
              }}
            >
              {(detail.items ?? []).map((item, i) => (
                <div
                  key={i}
                  style={{
                    padding: "12px 16px",
                    borderBottom:
                      i < (detail.items?.length ?? 0) - 1
                        ? "1px solid rgba(255,255,255,0.05)"
                        : "none",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "#f0f0f0" }}>
                      {item.product_name}
                    </div>
                    <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>
                      x{item.quantity} · ${item.unit_price.toFixed(2)} c/u
                    </div>
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#f0f0f0", fontFamily: "monospace" }}>
                    ${((item.subtotal ?? item.unit_price * item.quantity)).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div
              style={{
                borderTop: "1.5px solid rgba(255,255,255,0.1)",
                paddingTop: "12px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "14px", fontWeight: 600, color: "#999" }}>TOTAL</span>
              <span style={{ fontSize: "20px", fontWeight: 700, color: "#00e5a0", fontFamily: "monospace" }}>
                ${detail.total.toFixed(2)}
              </span>
            </div>

            {/* Ref */}
            <div style={{ marginTop: "12px", textAlign: "center" }}>
              <span style={{ fontSize: "11px", color: "#444", fontFamily: "monospace" }}>
                Ref: #{detail.id.slice(0, 8).toUpperCase()}
              </span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
