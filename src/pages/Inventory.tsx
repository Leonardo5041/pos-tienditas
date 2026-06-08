import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Camera, Plus, Pencil, AlertTriangle, MoreVertical, Trash2 } from "lucide-react";
import { productsApi } from "@/lib/products";
import { catalogApi } from "@/lib/catalog";
import type { Product } from "@/types/product";
import type { CatalogProduct } from "@/types/catalog";
import BarcodeScanner from "@/components/BarcodeScanner";
import ProductForm from "@/components/ProductForm";
import Modal from "@/components/Modal";
import Navbar from "@/components/Navbar";
import { useAuthStore } from "@/stores/authStore";
import { useIsMobile } from "@/hooks/useBreakpoint";

type StockState = "ok" | "low" | "out";

function stockState(p: Product): StockState {
  if (p.stock <= 0) return "out";
  if (p.stock <= p.low_stock_threshold) return "low";
  return "ok";
}

function StockBadge({ p }: { p: Product }) {
  const state = stockState(p);
  if (state === "out") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#ff6b6b]/[0.12] text-[#ff6b6b]">
        ✗ Agotado
      </span>
    );
  }
  if (state === "low") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#ff9f43]/[0.12] text-[#ff9f43]">
        ⚠ {p.stock} uds
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#00e5a0]/[0.12] text-[#00e5a0]">
      ✓ {p.stock} uds
    </span>
  );
}

export default function Inventory() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const autoHandledRef = useRef<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [catalogData, setCatalogData] = useState<CatalogProduct | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showOptionsSheet, setShowOptionsSheet] = useState(false);

  const { user } = useAuthStore();
  const isOwner = user?.role === "owner";
  const canEdit = user?.role === "owner" || user?.role === "inventory";
  const isMobile = useIsMobile();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", searchQuery],
    queryFn: () => productsApi.list(searchQuery ? { search: searchQuery } : undefined),
  });

  const lowStockCount = products.filter((p) => p.stock <= p.low_stock_threshold).length;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const handleBarcodeScan = async (code: string) => {
    try {
      const product = await productsApi.getByBarcode(code);
      setEditingProduct(product);
      setScannedBarcode(null);
      setCatalogData(null);
      setShowForm(true);
      return;
    } catch {
      // no está en inventario — consultar catálogo
    }
    try {
      const result = await catalogApi.lookup(code);
      if (result.found) {
        setCatalogData(result);
        setScannedBarcode(null);
      } else {
        setCatalogData(null);
        setScannedBarcode(code);
      }
    } catch {
      setCatalogData(null);
      setScannedBarcode(code);
    }
    setEditingProduct(null);
    setShowForm(true);
  };

  const handleSave = (_product: Product) => {
    setShowForm(false);
    setEditingProduct(null);
    setScannedBarcode(null);
    setCatalogData(null);
    queryClient.invalidateQueries({ queryKey: ["products"] });
    showToast("Producto guardado");
  };

  const confirmarEliminar = async () => {
    if (!selectedProduct) return;
    const confirmado = window.confirm(
      `¿Eliminar "${selectedProduct.name}"?\n\nEl producto dejará de aparecer en el inventario y no podrás escanearlo. Las ventas anteriores no se verán afectadas.`
    );
    if (!confirmado) return;
    try {
      await productsApi.remove(selectedProduct.id);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setSelectedProduct(null);
      showToast("Producto eliminado");
    } catch (err: unknown) {
      alert("Error al eliminar: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingProduct(null);
    setScannedBarcode(null);
    setCatalogData(null);
  };

  useEffect(() => {
    const code = searchParams.get("barcode");
    if (code && autoHandledRef.current !== code) {
      autoHandledRef.current = code;
      handleBarcodeScan(code);
      searchParams.delete("barcode");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-[#0f0f0f] pb-24">
      {toast && (
        <div className="fixed top-4 left-4 right-4 z-50 bg-[#00e5a0] text-black px-4 py-3 rounded-[10px] text-center font-semibold shadow-lg">
          {toast}
        </div>
      )}

      {showScanner && (
        <BarcodeScanner onDetected={handleBarcodeScan} onClose={() => setShowScanner(false)} />
      )}

      {showForm && isMobile && (
        <ProductForm
          product={editingProduct ?? undefined}
          initialBarcode={scannedBarcode ?? undefined}
          catalogData={catalogData ?? undefined}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
      <Modal
        isOpen={showForm && !isMobile}
        onClose={handleCancel}
        title={editingProduct ? "Editar producto" : "Nuevo producto"}
      >
        <ProductForm
          product={editingProduct ?? undefined}
          initialBarcode={scannedBarcode ?? undefined}
          catalogData={catalogData ?? undefined}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      </Modal>

      <header className="px-4 pt-3 pb-3 bg-[#0f0f0f]" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#f0f0f0]">Inventario</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowScanner(true)}
              aria-label="Escanear"
              className="w-10 h-10 rounded-[10px] bg-[#1a1a1a] border border-white/[0.08] text-white flex items-center justify-center"
            >
              <Camera size={18} />
            </button>
            <button
              onClick={() => {
                setEditingProduct(null);
                setScannedBarcode(null);
                setCatalogData(null);
                setShowForm(true);
              }}
              aria-label="Agregar producto"
              className="w-10 h-10 rounded-[10px] bg-[#00e5a0]/[0.12] border border-[#00e5a0]/25 text-[#00e5a0] text-xl font-bold flex items-center justify-center"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        <div className="relative mt-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
          <input
            type="search"
            placeholder="Buscar producto o código..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-[10px] bg-[#1a1a1a] border border-white/[0.08] text-[#f0f0f0] placeholder:text-[#666] focus:border-[#00e5a0] focus:outline-none focus:ring-1 focus:ring-[#00e5a0]/30"
          />
        </div>
      </header>

      {lowStockCount > 0 && (
        <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2.5 rounded-[10px] bg-[#ff9f43]/[0.12] border border-[#ff9f43]/25">
          <AlertTriangle size={16} className="text-[#ff9f43] flex-shrink-0" />
          <span className="text-sm font-medium text-[#ff9f43]">
            {lowStockCount} producto{lowStockCount === 1 ? "" : "s"} con stock bajo
          </span>
        </div>
      )}

      <div className="px-4 mt-3 flex flex-col gap-2">
        {isLoading ? (
          <>
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-16 rounded-[10px] bg-[#1a1a1a] animate-pulse" />
            ))}
          </>
        ) : products.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-5xl opacity-30 mb-2">📦</div>
            <p className="text-[#666]">Sin productos aún</p>
            <p className="text-[#444] text-sm mt-1">Toca + para agregar el primero</p>
          </div>
        ) : (
          products.map((product) => (
            <div
              key={product.id}
              className="bg-[#1a1a1a] border border-white/[0.08] rounded-[10px] px-4 py-3 flex items-center gap-3 active:bg-[#242424] transition-colors"
            >
              <div className="text-2xl w-10 text-center flex-shrink-0">📦</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#f0f0f0] truncate">{product.name}</p>
                <p className="text-xs text-[#666] font-mono mt-0.5">
                  {product.barcode || "sin código"}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-[#f0f0f0] font-mono">
                  ${product.price.toFixed(2)}
                </p>
                <div className="mt-1">
                  <StockBadge p={product} />
                </div>
              </div>
              {canEdit && (
                <button
                  onClick={() => {
                    setEditingProduct(product);
                    setScannedBarcode(null);
                    setCatalogData(null);
                    setShowForm(true);
                  }}
                  aria-label="Editar"
                  className="ml-2 w-8 h-8 rounded-md bg-[#242424] border border-white/[0.08] text-[#999] flex items-center justify-center flex-shrink-0"
                >
                  <Pencil size={14} />
                </button>
              )}
              {isOwner && (
                <button
                  onClick={() => {
                    setSelectedProduct(product);
                    setShowOptionsSheet(true);
                  }}
                  aria-label="Opciones"
                  className="w-8 h-8 rounded-lg bg-[#242424] border border-white/[0.08] flex items-center justify-center flex-shrink-0"
                >
                  <MoreVertical size={14} className="text-[#666]" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <Modal
        isOpen={showOptionsSheet && !!selectedProduct}
        onClose={() => setShowOptionsSheet(false)}
      >
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div style={{ fontSize: "15px", fontWeight: 600, color: "#f0f0f0", lineHeight: 1.3 }}>
            {selectedProduct?.name}
          </div>
          <div style={{ fontSize: "12px", color: "#555", fontFamily: "DM Mono, monospace", marginTop: "4px" }}>
            {selectedProduct?.barcode ?? "Sin código"}
          </div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#00e5a0", marginTop: "6px", fontFamily: "DM Mono, monospace" }}>
            ${selectedProduct?.price.toFixed(2)}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div
            onClick={() => {
              setShowOptionsSheet(false);
              setTimeout(() => {
                setEditingProduct(selectedProduct);
                setScannedBarcode(null);
                setCatalogData(null);
                setShowForm(true);
              }, 200);
            }}
            style={{
              display: "flex", alignItems: "center", gap: "16px",
              padding: "16px", borderRadius: "12px",
              background: "#242424", border: "1px solid rgba(255,255,255,0.06)",
              cursor: "pointer",
            }}
          >
            <Pencil size={20} color="#666" />
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#f0f0f0" }}>Editar producto</div>
              <div style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>Cambiar precio, stock o nombre</div>
            </div>
          </div>

          {isOwner && (
            <div
              onClick={() => {
                setShowOptionsSheet(false);
                setTimeout(() => confirmarEliminar(), 200);
              }}
              style={{
                display: "flex", alignItems: "center", gap: "16px",
                padding: "16px", borderRadius: "12px",
                background: "rgba(255,107,107,0.06)", border: "1px solid rgba(255,107,107,0.15)",
                cursor: "pointer",
              }}
            >
              <Trash2 size={20} color="#ff6b6b" />
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#ff6b6b" }}>Eliminar producto</div>
                <div style={{ fontSize: "12px", color: "rgba(255,107,107,0.6)", marginTop: "2px" }}>El producto dejará de aparecer</div>
              </div>
            </div>
          )}

          <button
            onClick={() => setShowOptionsSheet(false)}
            style={{
              marginTop: "4px", width: "100%", height: "44px",
              borderRadius: "12px", background: "transparent",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#666", fontSize: "14px", fontWeight: 500, cursor: "pointer",
            }}
          >
            Cancelar
          </button>
        </div>
      </Modal>

      <Navbar />
    </div>
  );
}
