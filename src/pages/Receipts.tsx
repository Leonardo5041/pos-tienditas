import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";
import { receiptsApi } from "@/lib/receipts";
import { productsApi } from "@/lib/products";
import { catalogApi, type CatalogSearchItem } from "@/lib/catalog";
import type { Product } from "@/types/product";
import type { ReceiptItemStatus } from "@/types/receipt";
import BarcodeScanner from "@/components/BarcodeScanner";
import Navbar from "@/components/Navbar";

type Step = "capture" | "processing" | "validation" | "success";

type LocalItem = {
  id: string;
  ai_product_name: string;
  matched_product_id: string | null;
  matched_product_name: string | null;
  is_new_product: boolean;
  new_product_name: string;
  new_product_barcode: string;
  new_product_price: number;
  new_product_unit: string;
  new_product_low_stock: number;
  matched_barcode: string;
  quantity: number;
  unit_cost: number;
  confidence_score: number;
  status: ReceiptItemStatus;
  resolved: boolean;
  editorOpen: boolean;
  advancedOpen: boolean;
  searchQuery: string;
  searchResults: Product[];
  showDropdown: boolean;
  catalogResults: CatalogSearchItem[];
  showCatalogDropdown: boolean;
  catalogQuery: string;
  itemError: string;
};

type ReceiptHeader = {
  receipt_id: string;
  supplier: string;
  date: string;
  total: number;
};

type ConfirmResult = {
  products_updated: number;
  products_created: number;
  total_amount: number;
};

function fmtMXN(n: number) {
  return n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s: string) {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function cardBorder(item: LocalItem): React.CSSProperties {
  if (item.status === "skipped")
    return { border: "1px solid rgba(255,255,255,0.06)", background: "transparent", opacity: 0.4 };
  if (item.resolved)
    return { border: "1px solid rgba(0,229,160,0.2)", background: "rgba(0,229,160,0.04)" };
  if (!item.editorOpen && item.matched_product_id)
    return { border: "1px solid rgba(255,217,61,0.3)", background: "rgba(255,217,61,0.04)" };
  return { border: "1px solid rgba(116,185,255,0.2)", background: "rgba(116,185,255,0.04)" };
}

const inputStyle: React.CSSProperties = {
  background: "#242424",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  color: "#f0f0f0",
  fontSize: 14,
  padding: "8px 12px",
  width: "100%",
  outline: "none",
  boxSizing: "border-box",
};

export default function Receipts() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("capture");
  const [header, setHeader] = useState<ReceiptHeader>({ receipt_id: "", supplier: "", date: "", total: 0 });
  const [items, setItems] = useState<LocalItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [scanningForIdx, setScanningForIdx] = useState<number | null>(null);

  const captureRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const addCaptureRef = useRef<HTMLInputElement>(null);
  const addGalleryRef = useRef<HTMLInputElement>(null);
  const searchTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const [addingPhoto, setAddingPhoto] = useState(false);

  const role = user?.role;
  const canAccess = role === "owner" || role === "inventory";

  const { data: historyList } = useQuery({
    queryKey: ["receipts", "list"],
    queryFn: receiptsApi.list,
    enabled: canAccess,
  });

  function updateItem(idx: number, patch: Partial<LocalItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function handleFileSelect(file: File | undefined) {
    if (!file) return;
    setError(null);
    setStep("processing");
    try {
      const base64 = await fileToBase64(file);
      const mimeType = file.type || "image/jpeg";
      const result = await receiptsApi.process(base64, mimeType);

      setHeader({
        receipt_id: result.receipt_id,
        supplier: result.supplier ?? "",
        date: result.date ?? "",
        total: result.total,
      });

      setItems(
        result.items.map((it) => {
          const hasMatch = !!it.matched_product_id;
          return {
            id: it.id,
            ai_product_name: it.ai_product_name,
            matched_product_id: it.matched_product_id,
            matched_product_name: it.matched_product_name,
            is_new_product: it.is_new_product,
            new_product_name: it.ai_product_name,
            new_product_barcode: "",
            new_product_price: 0,
            new_product_unit: "pza",
            new_product_low_stock: 5,
            matched_barcode: "",
            quantity: it.quantity,
            unit_cost: it.unit_cost,
            confidence_score: it.confidence_score,
            status: hasMatch ? "review" : ("new" as ReceiptItemStatus),
            resolved: false,
            editorOpen: !hasMatch,
            advancedOpen: false,
            searchQuery: "",
            searchResults: [],
            showDropdown: false,
            catalogResults: [],
            showCatalogDropdown: false,
            catalogQuery: "",
            itemError: "",
          };
        })
      );

      setStep("validation");
    } catch (e) {
      setError((e as Error).message);
      setStep("capture");
    }
  }

  async function handleAddPhoto(file: File | undefined) {
    if (!file || !header.receipt_id) return;
    setAddingPhoto(true);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const mimeType = file.type || "image/jpeg";
      const result = await receiptsApi.process(base64, mimeType, header.receipt_id);

      setHeader((h) => ({ ...h, total: h.total + result.total }));

      const newItems = result.items.map((it) => {
        const hasMatch = !!it.matched_product_id;
        return {
          id: it.id,
          ai_product_name: it.ai_product_name,
          matched_product_id: it.matched_product_id,
          matched_product_name: it.matched_product_name,
          is_new_product: it.is_new_product,
          new_product_name: it.ai_product_name,
          new_product_barcode: "",
          new_product_price: 0,
          new_product_unit: "pza",
          new_product_low_stock: 5,
          matched_barcode: "",
          quantity: it.quantity,
          unit_cost: it.unit_cost,
          confidence_score: it.confidence_score,
          status: hasMatch ? "review" : ("new" as ReceiptItemStatus),
          resolved: false,
          editorOpen: !hasMatch,
          advancedOpen: false,
          searchQuery: "",
          searchResults: [],
          showDropdown: false,
          catalogResults: [],
          showCatalogDropdown: false,
          catalogQuery: "",
          itemError: "",
        };
      });

      setItems((prev) => [...prev, ...newItems]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAddingPhoto(false);
    }
  }

  function selectProduct(idx: number, product: Product) {
    updateItem(idx, {
      matched_product_id: product.id,
      matched_product_name: product.name,
      is_new_product: false,
      status: "matched",
      resolved: true,
      editorOpen: false,
      searchQuery: "",
      searchResults: [],
      showDropdown: false,
      itemError: "",
    });
  }

  function confirmSuggestion(idx: number) {
    updateItem(idx, { resolved: true, status: "matched", itemError: "" });
  }

  function openEditor(idx: number) {
    updateItem(idx, {
      editorOpen: true,
      matched_product_id: null,
      matched_product_name: null,
      status: "new",
    });
  }

  function handleConfirmItem(idx: number) {
    const item = items[idx];
    if (!item.new_product_name.trim()) {
      updateItem(idx, { itemError: "El nombre es requerido" });
      return;
    }
    if (!item.new_product_price || item.new_product_price <= 0) {
      updateItem(idx, { itemError: "El precio de venta es requerido" });
      return;
    }
    updateItem(idx, {
      resolved: true,
      editorOpen: false,
      is_new_product: true,
      matched_product_id: null,
      status: "new",
      itemError: "",
    });
  }

  async function handleBarcodeDetected(idx: number, barcode: string) {
    const item = items[idx];

    // Si tiene match pendiente, el scanner llena el barcode del match
    if (item.matched_product_id && !item.resolved && !item.editorOpen) {
      updateItem(idx, { matched_barcode: barcode });
      setScanningForIdx(null);
      return;
    }

    try {
      const product = await productsApi.getByBarcode(barcode);
      selectProduct(idx, product);
      return;
    } catch { /* not in inventory */ }

    try {
      const catalogResult = await catalogApi.lookup(barcode);
      if (catalogResult.found) {
        updateItem(idx, {
          new_product_name: catalogResult.name.toUpperCase(),
          new_product_barcode: barcode,
        });
        return;
      }
    } catch { /* not in catalog */ }

    updateItem(idx, { new_product_barcode: barcode });
  }

  function handleUnifiedSearch(idx: number, query: string) {
    updateItem(idx, { searchQuery: query, showDropdown: true, searchResults: [], catalogResults: [] });
    if (searchTimers.current[idx]) clearTimeout(searchTimers.current[idx]);
    if (query.length < 2) return;
    searchTimers.current[idx] = setTimeout(async () => {
      const isNumeric = /^\d+$/.test(query.trim());

      // Barcode exact match in inventory → auto-select
      if (isNumeric) {
        try {
          const product = await productsApi.getByBarcode(query.trim());
          selectProduct(idx, product);
          return;
        } catch { /* not found, continue */ }
      }

      try {
        const data = await productsApi.list({ search: query });
        updateItem(idx, { searchResults: data?.items ?? [] });
      } catch { /* ignore */ }
      try {
        if (isNumeric) {
          const normalized = query.length === 12 ? "0" + query : query;
          const result = await catalogApi.lookup(normalized);
          if (result.found) {
            updateItem(idx, { catalogResults: [{ name: result.name, barcode: result.barcode, brand: "", quantity: "" }] });
          }
        } else {
          const results = await catalogApi.search(query);
          updateItem(idx, { catalogResults: results?.slice(0, 5) ?? [] });
        }
      } catch { /* ignore */ }
    }, 300);
  }

  function toggleSkip(idx: number) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        if (it.status === "skipped") {
          const base: ReceiptItemStatus = it.resolved ? "matched" : it.matched_product_id ? "review" : "new";
          return { ...it, status: base };
        }
        return { ...it, status: "skipped" };
      })
    );
  }

  async function handleConfirm() {
    if (!header.date) {
      setError("La fecha del ticket es requerida");
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      const activeItems = items.filter((it) => it.status !== "skipped");
      const result = await receiptsApi.confirm({
        receipt_id: header.receipt_id,
        supplier_name: header.supplier,
        receipt_date: header.date,
        total_amount: header.total,
        items: activeItems.map((it) => ({
          ai_product_name: it.matched_product_id ? it.ai_product_name : it.new_product_name,
          matched_product_id: it.matched_product_id,
          is_new_product: !it.matched_product_id,
          quantity: it.quantity,
          unit_cost: it.unit_cost,
          sale_price: it.new_product_price,
          unit: it.new_product_unit || "pza",
          barcode: it.matched_product_id ? it.matched_barcode : it.new_product_barcode,
          low_stock_threshold: it.new_product_low_stock ?? 5,
        })),
      });

      setConfirmResult({
        products_updated: result.products_updated,
        products_created: result.products_created,
        total_amount: header.total,
      });

      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["receipts"] });
      setStep("success");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConfirming(false);
    }
  }

  function reset() {
    setStep("capture");
    setHeader({ receipt_id: "", supplier: "", date: "", total: 0 });
    setItems([]);
    setError(null);
    setConfirmResult(null);
  }

  const pendingCount = items.filter((it) => it.status !== "skipped" && !it.resolved).length;
  const confirmedCount = items.filter((it) => it.resolved).length;
  const skippedCount = items.filter((it) => it.status === "skipped").length;

  // ── CAPTURA ────────────────────────────────────────────────────────
  function renderCapture() {
    return (
      <div style={{ padding: "24px 16px 16px" }}>
        <div
          style={{
            background: "#1a1a1a",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 18,
            padding: "32px 20px",
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 52, marginBottom: 12 }}>📷</div>
          <p style={{ fontSize: 17, fontWeight: 700, color: "#f0f0f0", margin: 0 }}>
            Fotografía tu ticket de compra
          </p>
          <p style={{ fontSize: 13, color: "#666", marginTop: 8, marginBottom: 24 }}>
            La IA extrae los productos y actualiza tu inventario
          </p>

          {error && (
            <div
              style={{
                background: "rgba(255,107,107,0.08)",
                border: "1px solid rgba(255,107,107,0.2)",
                borderRadius: 10,
                padding: "10px 14px",
                color: "#ff6b6b",
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <input
              ref={captureRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
            />
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
            />
            <button
              onClick={() => captureRef.current?.click()}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 12,
                background: "#00e5a0",
                color: "#000",
                fontWeight: 700,
                fontSize: 14,
                border: "none",
                cursor: "pointer",
              }}
            >
              📷 Escanear con IA
            </button>
            <button
              onClick={() => galleryRef.current?.click()}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 12,
                background: "#1e1e1e",
                color: "#f0f0f0",
                fontWeight: 600,
                fontSize: 14,
                border: "1px solid rgba(255,255,255,0.1)",
                cursor: "pointer",
              }}
            >
              🖼 Subir imagen
            </button>
          </div>
        </div>

        <p style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          Tickets procesados
        </p>

        {!historyList || historyList.length === 0 ? (
          <div style={{
            background: "#1a1a1a",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14,
            padding: "20px 16px",
          }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16, textAlign: "center" }}>
              ¿Cómo funciona?
            </p>
            {[
              { icon: "📸", title: "Fotografía la factura o ticket", desc: "Toma una foto o sube una imagen de tu ticket de compra" },
              { icon: "🤖", title: "La IA extrae los datos", desc: "Detecta productos, cantidades y precios automáticamente" },
              { icon: "✅", title: "Revisa y confirma", desc: "Valida los productos y tu inventario se actualiza solo" },
            ].map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: i < 2 ? 14 : 0 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: "rgba(0,229,160,0.08)", border: "1px solid rgba(0,229,160,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                }}>
                  {step.icon}
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#d0d0d0", margin: 0 }}>{step.title}</p>
                  <p style={{ fontSize: 12, color: "#555", margin: "2px 0 0" }}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {historyList.map((r) => (
              <div
                key={r.id}
                style={{
                  background: "#1a1a1a",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#f0f0f0", margin: 0 }}>
                    {r.supplier_name || "Sin proveedor"}
                  </p>
                  <p style={{ fontSize: 12, color: "#666", margin: "2px 0 0" }}>
                    {r.receipt_date ? fmtDate(r.receipt_date) : "Sin fecha"}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#00e5a0", margin: 0, fontFamily: "monospace" }}>
                    ${fmtMXN(r.total_amount)}
                  </p>
                  <p style={{ fontSize: 11, color: "#555", margin: "2px 0 0" }}>
                    {r.item_count} productos
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── PROCESANDO ─────────────────────────────────────────────────────
  function renderProcessing() {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            border: "3px solid rgba(0,229,160,0.15)",
            borderTop: "3px solid #00e5a0",
            animation: "spin 0.9s linear infinite",
            marginBottom: 20,
          }}
        />
        <p style={{ fontSize: 17, fontWeight: 700, color: "#f0f0f0", margin: 0 }}>
          Analizando ticket con IA...
        </p>
        <p style={{ fontSize: 13, color: "#666", marginTop: 6 }}>
          Esto puede tardar unos segundos
        </p>
      </div>
    );
  }

  // ── VALIDACIÓN ─────────────────────────────────────────────────────
  function renderValidation() {
    return (
      <div style={{ padding: "16px 16px 160px" }}>
        {/* Header editable */}
        <div
          style={{
            background: "#1a1a1a",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: 16,
            marginBottom: 14,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: "#555", display: "block", marginBottom: 4 }}>Proveedor</label>
              <input
                style={inputStyle}
                value={header.supplier}
                onChange={(e) => setHeader((h) => ({ ...h, supplier: e.target.value }))}
                placeholder="Nombre del proveedor"
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: header.date ? "#555" : "#ff6b6b", display: "block", marginBottom: 4 }}>
                Fecha {!header.date && "— requerida"}
              </label>
              <input
                style={{ ...inputStyle, borderColor: header.date ? undefined : "rgba(255,107,107,0.5)" }}
                type="date"
                value={header.date}
                onChange={(e) => setHeader((h) => ({ ...h, date: e.target.value }))}
              />
            </div>
          </div>
          <p style={{ fontSize: 13, color: "#666", margin: 0 }}>
            Total del ticket:{" "}
            <span style={{ color: "#f0f0f0", fontWeight: 700, fontFamily: "monospace" }}>
              ${fmtMXN(header.total)}
            </span>
          </p>
        </div>

        {/* Contador */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {confirmedCount > 0 && (
            <span style={{ fontSize: 12, background: "rgba(0,229,160,0.12)", color: "#00e5a0", borderRadius: 8, padding: "4px 10px" }}>
              ✅ {confirmedCount} confirmados
            </span>
          )}
          {skippedCount > 0 && (
            <span style={{ fontSize: 12, background: "rgba(255,255,255,0.06)", color: "#666", borderRadius: 8, padding: "4px 10px" }}>
              🗑 {skippedCount} omitidos
            </span>
          )}
          {pendingCount > 0 && (
            <span style={{ fontSize: 12, background: "rgba(255,217,61,0.12)", color: "#ffd93d", borderRadius: 8, padding: "4px 10px" }}>
              ⏳ {pendingCount} pendientes
            </span>
          )}
        </div>

        {/* Barra de progreso */}
        {(() => {
          const total = items.length;
          const done = confirmedCount + skippedCount;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <div style={{ marginBottom: 14 }}>
              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: pendingCount === 0 ? "#00e5a0" : "#ffd93d",
                  borderRadius: 4,
                  transition: "width 0.3s ease",
                }} />
              </div>
              <p style={{ fontSize: 11, color: "#444", margin: "4px 0 0", textAlign: "right" }}>
                {done}/{total}
              </p>
            </div>
          );
        })()}

        {/* Inputs ocultos para foto adicional */}
        <input ref={addCaptureRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
          onChange={(e) => { handleAddPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={addGalleryRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => { handleAddPhoto(e.target.files?.[0]); e.target.value = ""; }} />

        {/* Botón agregar foto */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button
            onClick={() => addCaptureRef.current?.click()}
            disabled={addingPhoto}
            style={{
              flex: 1, height: 40, borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: "rgba(116,185,255,0.08)", border: "1px solid rgba(116,185,255,0.2)",
              color: addingPhoto ? "#444" : "#74b9ff", cursor: addingPhoto ? "not-allowed" : "pointer",
            }}
          >
            {addingPhoto ? "⏳ Procesando..." : "📷 Agregar foto"}
          </button>
          <button
            onClick={() => addGalleryRef.current?.click()}
            disabled={addingPhoto}
            style={{
              flex: 1, height: 40, borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
              color: addingPhoto ? "#444" : "#666", cursor: addingPhoto ? "not-allowed" : "pointer",
            }}
          >
            🖼 Agregar imagen
          </button>
        </div>

        {/* Cards */}
        {items.map((item, idx) => (
          <div
            key={item.id}
            style={{
              ...cardBorder(item),
              borderRadius: 12,
              padding: 14,
              marginBottom: 10,
              position: "relative",
            }}
          >
            {/* Botón skip */}
            <button
              onClick={() => toggleSkip(idx)}
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                color: "#555",
                padding: "2px 6px",
              }}
              title={item.status === "skipped" ? "Restaurar" : "Omitir"}
            >
              {item.status === "skipped" ? "↩" : "🗑"}
            </button>

            {/* Nombre IA */}
            <p style={{ fontSize: 10, color: "#444", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Ticket dice:
            </p>
            <p style={{ fontSize: 12, color: "#666", fontFamily: "monospace", margin: "0 0 10px", paddingRight: 28 }}>
              {item.ai_product_name}
            </p>

            {item.status !== "skipped" && (
              <>
                {/* CONFIRMADO — resumen verde */}
                {item.resolved && (
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "#f0f0f0", margin: 0, wordBreak: "break-word" }}>
                        {item.matched_product_name ?? item.new_product_name}
                      </p>
                      <p style={{ fontSize: 12, color: "#555", margin: "4px 0 0", fontFamily: "monospace" }}>
                        {item.quantity} × ${fmtMXN(item.unit_cost)} = ${fmtMXN(item.quantity * item.unit_cost)}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (item.matched_product_id && item.status === "matched") {
                          // Tenía match confirmado → volver a sugerencia
                          updateItem(idx, { resolved: false, editorOpen: false });
                        } else {
                          // Producto nuevo → abrir editor
                          updateItem(idx, { resolved: false, editorOpen: true });
                        }
                      }}
                      style={{
                        background: "none",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8,
                        color: "#666",
                        fontSize: 12,
                        padding: "4px 10px",
                        cursor: "pointer",
                        flexShrink: 0,
                        whiteSpace: "nowrap",
                      }}
                    >
                      ✏️ Editar
                    </button>
                  </div>
                )}

                {/* SUGERENCIA — match de IA pendiente de confirmar */}
                {!item.resolved && !item.editorOpen && item.matched_product_id && (
                  <div>
                    <p style={{ fontSize: 12, color: "#ffd93d", margin: "0 0 6px" }}>¿Es este producto?</p>
                    <p style={{ fontSize: 15, fontWeight: 600, color: "#f0f0f0", margin: "0 0 12px" }}>
                      {item.matched_product_name}
                    </p>
                    <p style={{ fontSize: 12, color: "#555", margin: "0 0 10px", fontFamily: "monospace" }}>
                      {item.quantity} × ${fmtMXN(item.unit_cost)}
                    </p>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 11, color: "#555", display: "block", marginBottom: 4 }}>
                        Código de barras (opcional)
                      </label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          style={{ ...inputStyle, flex: 1, fontFamily: "monospace" }}
                          placeholder="Escanea o escribe..."
                          value={item.matched_barcode}
                          onChange={(e) => updateItem(idx, { matched_barcode: e.target.value })}
                        />
                        <button
                          onClick={() => setScanningForIdx(idx)}
                          style={{
                            width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                            background: "#1e1e1e", border: "1px solid rgba(255,255,255,0.1)",
                            color: "#ccc", fontSize: 16, cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          📷
                        </button>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => confirmSuggestion(idx)}
                        style={{
                          flex: 1,
                          height: 40,
                          borderRadius: 10,
                          background: "#00e5a0",
                          color: "#000",
                          fontWeight: 700,
                          fontSize: 13,
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        ✅ Sí, es este
                      </button>
                      <button
                        onClick={() => openEditor(idx)}
                        style={{
                          flex: 1,
                          height: 40,
                          borderRadius: 10,
                          background: "#242424",
                          color: "#f0f0f0",
                          fontWeight: 600,
                          fontSize: 13,
                          border: "1px solid rgba(255,255,255,0.1)",
                          cursor: "pointer",
                        }}
                      >
                        ❌ No, cambiar
                      </button>
                    </div>
                  </div>
                )}

                {/* EDITOR — sin match o después de "No, cambiar" */}
                {!item.resolved && item.editorOpen && (
                  <div>
                    {/* Búsqueda unificada + cámara */}
                    <div style={{ marginBottom: 12, position: "relative" }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          style={{ ...inputStyle, flex: 1 }}
                          placeholder="Buscar en inventario o catálogo..."
                          value={item.searchQuery}
                          onChange={(e) => handleUnifiedSearch(idx, e.target.value.toUpperCase())}
                          onFocus={() => updateItem(idx, { showDropdown: true })}
                          onBlur={() => setTimeout(() => updateItem(idx, { showDropdown: false }), 150)}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            if (item.searchResults.length === 1) {
                              selectProduct(idx, item.searchResults[0]);
                            } else if (item.searchResults.length === 0 && item.catalogResults.length === 1) {
                              const p = item.catalogResults[0];
                              updateItem(idx, {
                                new_product_name: p.name.toUpperCase(),
                                new_product_barcode: p.barcode,
                                searchQuery: "", searchResults: [], catalogResults: [], showDropdown: false,
                              });
                            }
                          }}
                        />
                        <button
                          onClick={() => setScanningForIdx(idx)}
                          style={{
                            width: 44, height: 44, borderRadius: 10,
                            background: "#1e1e1e",
                            border: "1px solid rgba(255,255,255,0.1)",
                            color: "#ccc", fontSize: 18, cursor: "pointer",
                            flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                          title="Escanear código de barras"
                        >
                          📷
                        </button>
                      </div>

                      {/* Dropdown unificado */}
                      {item.showDropdown && (item.searchResults.length > 0 || item.catalogResults.length > 0) && (
                        <div style={{
                          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 52,
                          background: "#1e1e1e",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 10, zIndex: 50, maxHeight: 220, overflowY: "auto",
                        }}>
                          {item.searchResults.length > 0 && (
                            <>
                              <p style={{ fontSize: 10, color: "#444", margin: 0, padding: "6px 12px 4px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                En inventario
                              </p>
                              {item.searchResults.map((p) => (
                                <button key={p.id} onMouseDown={() => selectProduct(idx, p)} style={{
                                  width: "100%", textAlign: "left", background: "none", border: "none",
                                  borderTop: "1px solid rgba(255,255,255,0.05)",
                                  padding: "9px 12px", color: "#f0f0f0", fontSize: 13, cursor: "pointer",
                                  display: "flex", alignItems: "center", gap: 8,
                                }}>
                                  <span style={{ color: "#00e5a0", fontSize: 7 }}>●</span>
                                  <span style={{ flex: 1 }}>{p.name}</span>
                                  <span style={{ color: "#444", fontSize: 11 }}>stock: {p.stock}</span>
                                </button>
                              ))}
                            </>
                          )}
                          {item.catalogResults.length > 0 && (
                            <>
                              <p style={{
                                fontSize: 10, color: "#444", margin: 0, padding: "6px 12px 4px",
                                textTransform: "uppercase", letterSpacing: "0.08em",
                                borderTop: item.searchResults.length > 0 ? "1px solid rgba(255,255,255,0.08)" : "none",
                              }}>
                                Catálogo nacional
                              </p>
                              {item.catalogResults.map((p, i) => (
                                <button key={i} onMouseDown={() => updateItem(idx, {
                                  new_product_name: p.name.toUpperCase(),
                                  new_product_barcode: p.barcode,
                                  searchQuery: "", searchResults: [], catalogResults: [], showDropdown: false,
                                })} style={{
                                  width: "100%", textAlign: "left", background: "none", border: "none",
                                  borderTop: "1px solid rgba(255,255,255,0.05)",
                                  padding: "9px 12px", color: "#f0f0f0", fontSize: 13, cursor: "pointer",
                                  display: "flex", alignItems: "center", gap: 8,
                                }}>
                                  <span style={{ color: "#74b9ff", fontSize: 7 }}>●</span>
                                  <span style={{ flex: 1 }}>{p.name}</span>
                                  <span style={{ color: "#444", fontSize: 11 }}>{p.brand}{p.quantity ? ` · ${p.quantity}` : ""}</span>
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Divisor */}
                    <div style={{ height: 1, background: "rgba(255,255,255,0.06)", marginBottom: 12 }} />

                    {/* Nombre */}
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Nombre *</label>
                      <input
                        style={inputStyle}
                        placeholder="NOMBRE DEL PRODUCTO"
                        value={item.new_product_name}
                        onChange={(e) => updateItem(idx, { new_product_name: e.target.value.toUpperCase(), itemError: "" })}
                      />
                    </div>

                    {/* Precio de venta */}
                    <div style={{ marginBottom: 10 }}>
                      <label style={{
                        fontSize: 11, display: "block", marginBottom: 4,
                        color: item.new_product_price === 0 ? "#ff9f43" : "#888",
                      }}>
                        Precio de venta *{item.new_product_price === 0 ? " — pendiente" : ""}
                      </label>
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#555", fontSize: 13 }}>$</span>
                        <input
                          style={{
                            ...inputStyle, paddingLeft: 22, fontFamily: "monospace",
                            border: item.new_product_price === 0
                              ? "1px solid rgba(255,159,67,0.45)"
                              : inputStyle.border as string,
                          }}
                          type="number" min="0" step="0.01" placeholder="0.00"
                          value={item.new_product_price || ""}
                          onChange={(e) => updateItem(idx, { new_product_price: parseFloat(e.target.value) || 0, itemError: "" })}
                        />
                      </div>
                    </div>

                    {/* Cantidad + Costo */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Cantidad</label>
                        <input
                          style={{ ...inputStyle, textAlign: "center", fontFamily: "monospace" }}
                          type="number" min="0" step="0.001"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Costo c/u</label>
                        <div style={{ position: "relative" }}>
                          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#555", fontSize: 13 }}>$</span>
                          <input
                            style={{ ...inputStyle, paddingLeft: 22, fontFamily: "monospace" }}
                            type="number" min="0" step="0.01"
                            value={item.unit_cost}
                            onChange={(e) => updateItem(idx, { unit_cost: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Opciones adicionales — colapsable */}
                    <button
                      onClick={() => updateItem(idx, { advancedOpen: !item.advancedOpen })}
                      style={{
                        width: "100%", textAlign: "left",
                        background: item.advancedOpen ? "rgba(116,185,255,0.06)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${item.advancedOpen ? "rgba(116,185,255,0.2)" : "rgba(255,255,255,0.08)"}`,
                        borderRadius: item.advancedOpen ? "10px 10px 0 0" : 10,
                        color: item.advancedOpen ? "#74b9ff" : "#666",
                        fontSize: 12, fontWeight: 600, cursor: "pointer",
                        padding: "9px 12px", marginBottom: 0,
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                      }}
                    >
                      <span>⚙ Más opciones</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {item.new_product_barcode && !item.advancedOpen && (
                          <span style={{ color: "#444", fontFamily: "monospace", fontSize: 11 }}>
                            {item.new_product_barcode}
                          </span>
                        )}
                        {!item.advancedOpen && (
                          <span style={{
                            fontSize: 11, background: "rgba(255,255,255,0.06)",
                            borderRadius: 6, padding: "2px 7px", color: "#555",
                          }}>
                            {item.new_product_unit} · alerta {item.new_product_low_stock}u
                          </span>
                        )}
                        <span>{item.advancedOpen ? "▾" : "▸"}</span>
                      </span>
                    </button>
                    {item.advancedOpen && (
                      <div style={{
                        background: "rgba(116,185,255,0.04)",
                        border: "1px solid rgba(116,185,255,0.2)",
                        borderTop: "none",
                        borderRadius: "0 0 10px 10px",
                        padding: "12px 12px 4px",
                        marginBottom: 10,
                      }}>
                        {/* Unidad */}
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 6 }}>Unidad de medida</label>
                          <div style={{ display: "flex", gap: 6 }}>
                            {(["pza", "kg", "g"] as const).map((u) => (
                              <button
                                key={u}
                                onClick={() => updateItem(idx, {
                              new_product_unit: u,
                              new_product_low_stock: u === "pza" ? 5 : 0.5,
                            })}
                                style={{
                                  flex: 1, height: 36, borderRadius: 8, fontSize: 13, fontWeight: 600,
                                  cursor: "pointer", border: "none",
                                  background: item.new_product_unit === u ? "#74b9ff" : "#242424",
                                  color: item.new_product_unit === u ? "#000" : "#666",
                                  transition: "all 0.15s",
                                }}
                              >
                                {u}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Alerta de stock bajo */}
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ fontSize: 11, display: "block", marginBottom: 4 }}>
                            <span style={{ color: "#ff9f43" }}>⚠</span>
                            <span style={{ color: "#888", marginLeft: 4 }}>Alerta de stock bajo — avisar cuando queden menos de</span>
                          </label>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input
                              style={{ ...inputStyle, width: 80, textAlign: "center", fontFamily: "monospace",
                                border: "1px solid rgba(255,159,67,0.3)" }}
                              type="number" min="0" step={item.new_product_unit === "pza" ? "1" : "0.001"}
                              value={item.new_product_low_stock}
                              onChange={(e) => updateItem(idx, { new_product_low_stock: parseFloat(e.target.value) || 0 })}
                            />
                            <span style={{ fontSize: 13, color: "#555" }}>unidades</span>
                          </div>
                        </div>

                        {/* Código de barras */}
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Código de barras</label>
                          <div style={{ display: "flex", gap: 8 }}>
                            <input
                              style={{ ...inputStyle, flex: 1, fontFamily: "monospace" }}
                              placeholder="Escanea o escribe..."
                              value={item.new_product_barcode}
                              onChange={(e) => updateItem(idx, { new_product_barcode: e.target.value })}
                            />
                            <button
                              onClick={() => setScanningForIdx(idx)}
                              style={{
                                width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                                background: "#1e1e1e", border: "1px solid rgba(255,255,255,0.1)",
                                color: "#ccc", fontSize: 16, cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}
                            >
                              📷
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {item.itemError && (
                      <p style={{ fontSize: 12, color: "#ff6b6b", margin: "0 0 8px" }}>{item.itemError}</p>
                    )}

                    <button
                      onClick={() => handleConfirmItem(idx)}
                      style={{
                        width: "100%", height: 50, borderRadius: 12,
                        background: "#00e5a0", color: "#000",
                        fontWeight: 700, fontSize: 15,
                        border: "none", cursor: "pointer", marginTop: 4,
                      }}
                    >
                      ✓ Confirmar producto
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {/* Barra inferior fija */}
        <div style={{
          position: "fixed",
          bottom: "calc(64px + env(safe-area-inset-bottom))",
          left: 0, right: 0,
          background: "#141414",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          padding: "10px 16px 12px",
          zIndex: 40,
        }}>
          {error && (
            <p style={{ fontSize: 12, color: "#ff6b6b", margin: "0 0 8px", textAlign: "center" }}>{error}</p>
          )}
          {pendingCount > 0 ? (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              height: 44,
            }}>
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(255,217,61,0.1)",
                border: "1px solid rgba(255,217,61,0.2)",
                borderRadius: 20,
                padding: "6px 14px",
                fontSize: 13,
                color: "#ffd93d",
                fontWeight: 600,
              }}>
                ⚠ {pendingCount} pendiente{pendingCount !== 1 ? "s" : ""}
              </span>
              <span style={{ fontSize: 12, color: "#444" }}>
                {confirmedCount} ✓{skippedCount > 0 ? `  ·  ${skippedCount} omitidos` : ""}
              </span>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 12, color: "#00e5a0", margin: "0 0 8px", textAlign: "center" }}>
                ✓ {confirmedCount} listo{confirmedCount !== 1 ? "s" : ""}{skippedCount > 0 ? ` · ${skippedCount} omitidos` : ""} · ${fmtMXN(header.total)}
              </p>
              <button
                onClick={handleConfirm}
                disabled={confirming}
                style={{
                  width: "100%",
                  height: 52,
                  borderRadius: 14,
                  background: "#00e5a0",
                  color: "#000",
                  fontWeight: 700,
                  fontSize: 15,
                  border: "none",
                  cursor: confirming ? "not-allowed" : "pointer",
                  opacity: confirming ? 0.7 : 1,
                }}
              >
                {confirming ? "Guardando..." : "Confirmar y actualizar inventario"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── ÉXITO ──────────────────────────────────────────────────────────
  function renderSuccess() {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "70vh",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
        <p style={{ fontSize: 20, fontWeight: 700, color: "#f0f0f0", margin: 0 }}>
          Inventario actualizado
        </p>

        {confirmResult && (
          <div
            style={{
              background: "#1a1a1a",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
              padding: 20,
              marginTop: 20,
              marginBottom: 24,
              width: "100%",
              maxWidth: 320,
            }}
          >
            {confirmResult.products_updated > 0 && (
              <p style={{ fontSize: 15, color: "#00e5a0", margin: "0 0 8px" }}>
                {confirmResult.products_updated} productos actualizados
              </p>
            )}
            {confirmResult.products_created > 0 && (
              <p style={{ fontSize: 15, color: "#74b9ff", margin: "0 0 8px" }}>
                {confirmResult.products_created} productos nuevos creados
              </p>
            )}
            <p style={{ fontSize: 15, color: "#ff9f43", margin: 0 }}>
              Gasto registrado: ${fmtMXN(confirmResult.total_amount)}
            </p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 320 }}>
          <button
            onClick={reset}
            style={{
              height: 48,
              borderRadius: 12,
              background: "#00e5a0",
              color: "#000",
              fontWeight: 700,
              fontSize: 15,
              border: "none",
              cursor: "pointer",
            }}
          >
            Procesar otro ticket
          </button>
          <button
            onClick={() => navigate("/inventory")}
            style={{
              height: 44,
              borderRadius: 12,
              background: "#1a1a1a",
              color: "#f0f0f0",
              fontWeight: 600,
              fontSize: 14,
              border: "1px solid rgba(255,255,255,0.1)",
              cursor: "pointer",
            }}
          >
            Ver inventario
          </button>
        </div>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#555", paddingTop: 80 }}>
        <p>Solo owner e inventory pueden acceder a esta sección.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f0f" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Scanner overlay por item */}
      {scanningForIdx !== null && (
        <BarcodeScanner
          onDetected={(barcode) => handleBarcodeDetected(scanningForIdx, barcode)}
          onClose={() => setScanningForIdx(null)}
        />
      )}

      {/* Header */}
      <div
        style={{
          padding: "16px 16px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        {step !== "capture" && (
          <button
            onClick={step === "success" ? reset : () => setStep("capture")}
            style={{
              background: "none",
              border: "none",
              color: "#666",
              fontSize: 20,
              cursor: "pointer",
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            ←
          </button>
        )}
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#f0f0f0", margin: 0 }}>
          {step === "capture"    && "Tickets de compra"}
          {step === "processing" && "Procesando..."}
          {step === "validation" && "Revisar ticket"}
          {step === "success"    && "Listo"}
        </h1>
      </div>

      {step === "capture"    && renderCapture()}
      {step === "processing" && renderProcessing()}
      {step === "validation" && renderValidation()}
      {step === "success"    && renderSuccess()}

      <Navbar />
    </div>
  );
}
