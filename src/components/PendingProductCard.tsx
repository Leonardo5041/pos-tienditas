import { useState } from "react";
import { productsApi } from "@/lib/products";
import type { Product } from "@/types/product";

type Props = {
  product: Product;
  onResolved: () => void;
};

export default function PendingProductCard({ product, onResolved }: Props) {
  const [cost, setCost] = useState(product.cost ? String(product.cost) : "");
  const [stock, setStock] = useState(String(product.stock));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResolve = async () => {
    setLoading(true);
    setError(null);
    try {
      const data: { cost?: number; stock?: number } = {};
      const costNum = parseFloat(cost);
      const stockNum = parseFloat(stock);
      if (!isNaN(costNum) && cost.trim() !== "") data.cost = costNum;
      if (!isNaN(stockNum)) data.stock = stockNum;
      await productsApi.resolve(product.id, data);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al resolver");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        background: "#242424",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#f0f0f0", margin: 0 }}>{product.name}</p>
          {product.barcode && (
            <p style={{ fontSize: 11, color: "#555", fontFamily: "DM Mono, monospace", margin: "2px 0 0" }}>
              {product.barcode}
            </p>
          )}
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#00e5a0", fontFamily: "DM Mono, monospace", flexShrink: 0, marginLeft: 12 }}>
          ${product.price.toFixed(2)}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>
            Precio de compra
          </label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#555", fontSize: 13 }}>$</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="0.00"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              style={{
                width: "100%", height: 36, paddingLeft: 20, paddingRight: 8,
                background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, color: "#f0f0f0", fontSize: 13,
                fontFamily: "DM Mono, monospace", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>
            Stock
          </label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            style={{
              width: "100%", height: 36, padding: "0 8px",
              background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8, color: "#f0f0f0", fontSize: 13,
              fontFamily: "DM Mono, monospace", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {error && (
        <p style={{ fontSize: 12, color: "#ff6b6b", margin: 0 }}>{error}</p>
      )}

      <button
        onClick={handleResolve}
        disabled={loading}
        style={{
          height: 40, borderRadius: 10,
          background: loading ? "rgba(0,229,160,0.3)" : "#00e5a0",
          border: "none", color: "#000",
          fontSize: 13, fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Guardando..." : "✓ Marcar revisado"}
      </button>
    </div>
  );
}
