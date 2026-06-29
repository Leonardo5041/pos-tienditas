import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import JsBarcode from "jsbarcode";
import { useAuthStore } from "@/stores/authStore";
import { productsApi } from "@/lib/products";
import { useBLEPrinter } from "@/hooks/useBLEPrinter";
import { buildLabelESCPOS } from "@/lib/escpos";
import Modal from "@/components/Modal";
import type { Product } from "@/types/product";

export default function Barcodes() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { store, user } = useAuthStore();
  const canGenerate = user?.role !== "cashier";

  const [selected, setSelected] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generatedId, setGeneratedId] = useState<string | null>(null);

  const { isConnected, isReconnecting, isSupported, connect, print } = useBLEPrinter();

  const { data: noBarcodeData } = useQuery({
    queryKey: ["products", "no-barcode"],
    queryFn: () => productsApi.list({ no_barcode: true, limit: 200 }),
  });

  const { data: generatedData } = useQuery({
    queryKey: ["products", "generated"],
    queryFn: () => productsApi.list({ generated: true, limit: 200 }),
  });

  const noBarcodeProducts = noBarcodeData?.products ?? [];
  const generatedProducts = generatedData?.products ?? [];

  const withBarcodeCount = generatedProducts.length;
  const noBarcodeCount = noBarcodeProducts.length;

  // Unified list: generated (selectable) + no-barcode (generate button)
  // Merge and deduplicate by id
  const allProducts = [
    ...generatedProducts,
    ...noBarcodeProducts.filter((p) => !generatedProducts.find((g) => g.id === p.id)),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const filtered = allProducts.filter((p) => {
    if (!search) return true;
    return p.name.includes(search) || (p.barcode ?? "").includes(search);
  });

  const selectableProducts = filtered.filter((p) => !!p.barcode);
  const allSelectableIds = selectableProducts.map((p) => p.id);
  const allSelected =
    allSelectableIds.length > 0 &&
    allSelectableIds.every((id) => !!selected[id]);

  useEffect(() => {
    const pre = (location.state as { preselected?: string } | null)?.preselected;
    if (pre) {
      setSelected({ [pre]: 1 });
      setShowPreview(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSelectAll() {
    if (allSelected) {
      const next = { ...selected };
      allSelectableIds.forEach((id) => delete next[id]);
      setSelected(next);
    } else {
      const next = { ...selected };
      allSelectableIds.forEach((id) => { if (!next[id]) next[id] = 1; });
      setSelected(next);
    }
  }

  function generateSVG(barcode: string): string {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, barcode, {
      format: "EAN13",
      width: 2.5,
      height: 70,
      displayValue: true,
      fontSize: 12,
      margin: 5,
      marginTop: 10,
      marginBottom: 10,
      background: "white",
      lineColor: "black",
    });
    return svg.outerHTML;
  }

  function handleWindowPrint(toPrint: Product[]) {
    const style = `
      @media print {
        body * { visibility: hidden }
        #print-labels, #print-labels * { visibility: visible }
        #print-labels {
          position: fixed;
          top: 0; left: 0;
          width: 58mm;
          font-family: monospace;
        }
        .lbl {
          width: 54mm;
          padding: 4mm 3mm;
          text-align: center;
          page-break-inside: avoid;
          border-bottom: 1px dashed #ccc;
        }
        .lbl-store { font-size:8pt; font-weight:bold }
        .lbl-name  { font-size:10pt; font-weight:bold; word-break:break-word }
        .lbl-unit  { font-size:8pt; color:#666 }
        .lbl-bc svg { width:100%; height:20mm; max-width:56mm }
      }
    `;

    const html = toPrint
      .flatMap((p) =>
        Array.from({ length: selected[p.id] }).map(
          () => `<div class="lbl">
            <div class="lbl-store">${store?.name ?? "Mi Tiendita"}</div>
            <div class="lbl-name">${p.name}</div>
            <div class="lbl-unit">${p.unit}</div>
            <div class="lbl-bc">${generateSVG(p.barcode!)}</div>
          </div>`
        )
      )
      .join("");

    let el = document.getElementById("print-labels");
    if (!el) {
      el = document.createElement("div");
      el.id = "print-labels";
      document.body.appendChild(el);
    }
    el.innerHTML = html;

    let styleEl = document.getElementById("print-labels-style");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "print-labels-style";
      document.head.appendChild(styleEl);
    }
    styleEl.innerHTML = style;

    setTimeout(() => window.print(), 200);
  }

  const handlePrint = async () => {
    const toPrint = generatedProducts.filter((p) => selected[p.id] && !!p.barcode);
    if (isSupported && isConnected) {
      for (const p of toPrint) {
        const bytes = buildLabelESCPOS({
          storeName: store?.name ?? "Mi Tiendita",
          productName: p.name,
          unit: p.unit ?? "pza",
          barcode: p.barcode!,
          copies: selected[p.id],
        });
        await print(bytes);
      }
    } else if (isSupported && !isConnected) {
      await connect();
    } else {
      handleWindowPrint(toPrint);
    }
  };

  const totalCopies = Object.values(selected).reduce((a, b) => a + b, 0);
  const totalProducts = Object.keys(selected).length;

  return (
    <div className="min-h-screen bg-[#0f0f0f] pb-28">
      {/* Header */}
      <header
        className="px-4 py-3 flex items-center gap-3 border-b border-white/[0.06]"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          onClick={() => navigate("/inventory")}
          className="w-9 h-9 rounded-full bg-[#1a1a1a] border border-white/[0.08] text-white flex items-center justify-center"
          aria-label="Volver"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-[#f0f0f0]">Etiquetas</h1>
          {allProducts.length > 0 && (
            <p className="text-xs text-[#555] mt-0.5">
              {withBarcodeCount} generados · {noBarcodeCount} sin código
            </p>
          )}
        </div>
        {isSupported && (
          <button
            onClick={() => { if (!isConnected && !isReconnecting) void connect(); }}
            className="text-xs px-3 py-1.5 rounded-full border flex-shrink-0"
            style={
              isConnected
                ? { background: "rgba(0,229,160,0.1)", color: "#00e5a0", borderColor: "rgba(0,229,160,0.3)" }
                : isReconnecting
                ? { background: "rgba(255,159,67,0.1)", color: "#ff9f43", borderColor: "rgba(255,159,67,0.3)" }
                : { background: "#242424", color: "#555", borderColor: "rgba(255,255,255,0.08)" }
            }
          >
            {isConnected ? "🖨️ Conectada" : isReconnecting ? "🔄 Reconectando..." : "🖨️ Conectar"}
          </button>
        )}
      </header>

      <div className="px-4 py-4 flex flex-col gap-3">
        {/* Search */}
        <input
          type="search"
          placeholder="Buscar por nombre o código..."
          value={search}
          onChange={(e) => setSearch(e.target.value.toUpperCase())}
          className="w-full h-11 px-4 rounded-[10px] bg-[#1a1a1a] border border-white/[0.08] text-[#f0f0f0] placeholder:text-[#666] focus:border-[#00e5a0] focus:outline-none"
        />

        {/* Select all row */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#555]">
              {filtered.length} producto{filtered.length !== 1 ? "s" : ""}
            </span>
            {selectableProducts.length > 0 && (
              <button
                onClick={toggleSelectAll}
                className="text-xs font-medium"
                style={{ color: "#00e5a0" }}
              >
                {allSelected ? "Deseleccionar todos" : "Seleccionar todos"}
              </button>
            )}
          </div>
        )}

        {/* Unified list */}
        {filtered.length === 0 && allProducts.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="text-3xl">📦</span>
            <p className="text-sm font-semibold text-[#f0f0f0]">Sin productos</p>
            <p className="text-xs text-[#555]">Agrega productos desde el inventario</p>
          </div>
        )}

        {filtered.length === 0 && allProducts.length > 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="text-3xl">🔍</span>
            <p className="text-sm font-semibold text-[#f0f0f0]">Sin resultados</p>
            <p className="text-xs text-[#555]">Prueba con otro nombre o código</p>
          </div>
        )}

        {filtered.map((product) => {
          const canSelect = !!product.barcode;
          const isSelected = canSelect && !!selected[product.id];
          const copies = selected[product.id] ?? 1;
          const isGenerating = generatingId === product.id;
          const justGenerated = generatedId === product.id;

          return (
            <div
              key={product.id}
              className="bg-[#1a1a1a] border border-white/[0.08] rounded-[12px] px-4 py-3"
            >
              <div className="flex items-center gap-3">
                {/* Checkbox */}
                <div
                  onClick={() => {
                    if (!canSelect) return;
                    if (isSelected) {
                      const next = { ...selected };
                      delete next[product.id];
                      setSelected(next);
                    } else {
                      setSelected({ ...selected, [product.id]: 1 });
                    }
                  }}
                  className="w-5 h-5 rounded-[4px] flex items-center justify-center flex-shrink-0"
                  style={{
                    background: isSelected ? "#00e5a0" : "transparent",
                    border: isSelected
                      ? "1.5px solid #00e5a0"
                      : "1.5px solid rgba(255,255,255,0.2)",
                    opacity: canSelect ? 1 : 0.3,
                    cursor: canSelect ? "pointer" : "not-allowed",
                  }}
                >
                  {isSelected && <span className="text-xs text-black font-bold">✓</span>}
                </div>

                {/* Name + barcode */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#f0f0f0] truncate">{product.name}</p>
                  {canSelect ? (
                    <p className="text-xs text-[#444] font-mono mt-0.5">{product.barcode}</p>
                  ) : justGenerated ? (
                    <p className="text-xs mt-0.5" style={{ color: "#00e5a0" }}>✅ Código generado</p>
                  ) : (
                    <p className="text-xs text-[#555] mt-0.5">sin código</p>
                  )}
                </div>

                {/* Unit badge */}
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#242424] text-[#666] flex-shrink-0">
                  {product.unit ?? "pza"}
                </span>

                {/* Generate or print icon */}
                {canSelect ? (
                  <button
                    onClick={() => {
                      setSelected({ [product.id]: 1 });
                      void handlePrint();
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0"
                    style={{ background: "#242424", border: "1px solid rgba(255,255,255,0.08)", color: "#666" }}
                    title="Imprimir esta etiqueta"
                  >
                    🖨️
                  </button>
                ) : !product.barcode && canGenerate ? (
                  <button
                    disabled={isGenerating}
                    onClick={async () => {
                      setGeneratingId(product.id);
                      try {
                        await productsApi.generateBarcode(product.id);
                        void queryClient.invalidateQueries({ queryKey: ["products", "no-barcode"] });
                        void queryClient.invalidateQueries({ queryKey: ["products", "generated"] });
                        void queryClient.invalidateQueries({ queryKey: ["products"] });
                        setGeneratedId(product.id);
                        setSelected((prev) => ({ ...prev, [product.id]: 1 }));
                        setTimeout(() => setGeneratedId(null), 2000);
                      } finally {
                        setGeneratingId(null);
                      }
                    }}
                    className="text-xs px-3 py-1.5 rounded-full font-semibold flex-shrink-0"
                    style={{
                      background: "rgba(0,229,160,0.08)",
                      border: "1px solid rgba(0,229,160,0.2)",
                      color: "#00e5a0",
                      opacity: isGenerating ? 0.5 : 1,
                    }}
                  >
                    {isGenerating ? "..." : "✦ Generar"}
                  </button>
                ) : null}
              </div>

              {/* Copies row */}
              {isSelected && (
                <div className="mt-2.5 flex items-center gap-3 pl-8">
                  <span className="text-xs text-[#555]">Copias:</span>
                  <button
                    disabled={copies <= 1}
                    onClick={() => setSelected({ ...selected, [product.id]: copies - 1 })}
                    className="w-7 h-7 rounded-full bg-[#242424] text-white text-sm flex items-center justify-center disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="text-sm font-bold text-[#f0f0f0] w-6 text-center">{copies}</span>
                  <button
                    disabled={copies >= 50}
                    onClick={() => setSelected({ ...selected, [product.id]: copies + 1 })}
                    className="w-7 h-7 rounded-full bg-[#242424] text-white text-sm flex items-center justify-center disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom bar */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-[#1a1a1a] border-t border-white/[0.08]"
        style={{ padding: "12px 16px", paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
      >
        {totalCopies === 0 ? (
          <p className="text-sm text-[#444] text-center">
            Selecciona productos para imprimir etiquetas
          </p>
        ) : (
          <div className="flex gap-2.5 items-center">
            <span className="text-sm text-[#666] flex-1">
              {totalProducts} producto{totalProducts !== 1 ? "s" : ""} · {totalCopies} etiqueta{totalCopies !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => setShowPreview(true)}
              className="h-11 px-4 rounded-[10px] text-sm font-medium"
              style={{ background: "#242424", border: "1px solid rgba(255,255,255,0.1)", color: "#999" }}
            >
              👁 Previa
            </button>
            <button
              onClick={() => void handlePrint()}
              className="h-11 px-5 rounded-[10px] font-bold text-black"
              style={{ background: "#00e5a0" }}
            >
              🖨️ Imprimir
            </button>
          </div>
        )}
      </div>

      {/* Preview modal */}
      <Modal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        title="Vista previa de etiquetas"
        maxWidth={380}
      >
        <div style={{ overflowY: "auto", maxHeight: "60vh" }}>
          {generatedProducts
            .filter((p) => selected[p.id] && !!p.barcode)
            .flatMap((p) =>
              Array.from({ length: selected[p.id] }).map((_, i) => (
                <div
                  key={p.id + i}
                  style={{
                    background: "white",
                    color: "black",
                    borderRadius: "8px",
                    padding: "14px 10px",
                    marginBottom: "8px",
                    textAlign: "center",
                    fontFamily: "monospace",
                  }}
                >
                  <div style={{ fontSize: "10px", fontWeight: "bold" }}>{store?.name}</div>
                  <div style={{ fontSize: "13px", fontWeight: "bold", wordBreak: "break-word" }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: "9px", color: "#888" }}>{p.unit}</div>
                  <div dangerouslySetInnerHTML={{ __html: generateSVG(p.barcode!) }} />
                </div>
              ))
            )}
        </div>
        <button
          onClick={() => void handlePrint()}
          style={{
            width: "100%",
            height: "48px",
            borderRadius: "12px",
            background: "#00e5a0",
            border: "none",
            color: "#000",
            fontSize: "15px",
            fontWeight: 700,
            cursor: "pointer",
            marginTop: "12px",
          }}
        >
          🖨️ Imprimir
        </button>
      </Modal>
    </div>
  );
}
