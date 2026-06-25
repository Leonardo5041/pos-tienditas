import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Camera, Plus, Pencil, AlertTriangle, MoreVertical, Trash2 } from "lucide-react";
import { productsApi } from "@/lib/products";
import type { ProductsPage } from "@/lib/products";
import { catalogApi } from "@/lib/catalog";
import { pendingProductsDb } from "@/lib/db";
import type { Product } from "@/types/product";
import type { CatalogProduct } from "@/types/catalog";
import type { PendingProductOp } from "@/types/pending-product";
import BarcodeScanner from "@/components/BarcodeScanner";
import ProductForm from "@/components/ProductForm";
import PendingProductCard from "@/components/PendingProductCard";
import Modal from "@/components/Modal";
import Navbar from "@/components/Navbar";
import { useAuthStore } from "@/stores/authStore";

type StockState = "ok" | "low" | "out";

function stockState(p: Product): StockState {
  if (p.stock <= 0) return "out";
  if (p.stock <= p.low_stock_threshold) return "low";
  return "ok";
}

const BULK_UNITS = new Set(["kg"]);

function formatStock(stock: number, unit?: string): string {
  if (unit && BULK_UNITS.has(unit.toLowerCase())) {
    return parseFloat(stock.toFixed(3)).toString();
  }
  return Math.round(stock).toString();
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
        ⚠ {formatStock(p.stock, p.unit)} {p.unit ?? "uds"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#00e5a0]/[0.12] text-[#00e5a0]">
      ✓ {formatStock(p.stock, p.unit)} {p.unit ?? "uds"}
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
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showOptionsSheet, setShowOptionsSheet] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [showLowStock, setShowLowStock] = useState(false);

  const { user } = useAuthStore();
  const isOwner = user?.role === "owner";
  const canEdit = user?.role === "owner" || user?.role === "inventory";

  const CACHE_KEY = "products_cache";

  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [cacheVersion, setCacheVersion] = useState(0);
  const forceRefreshCache = useCallback(() => setCacheVersion((v) => v + 1), []);

  useEffect(() => {
    const on = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cachedProducts = useMemo<Product[]>(() => {
    if (!isOffline) return [];
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      const all: Product[] = JSON.parse(raw);
      if (!searchQuery) return all;
      const q = searchQuery.toLowerCase();
      return all.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.barcode ?? "").includes(q)
      );
    } catch {
      return [];
    }
  }, [isOffline, searchQuery, cacheVersion]);

  const { data: fetchedData, isLoading } = useQuery<ProductsPage>({
    queryKey: ["products", searchQuery, page],
    queryFn: () => productsApi.list({ ...(searchQuery ? { search: searchQuery } : {}), page }),
    enabled: !isOffline,
  });
  const fetchedProducts = fetchedData?.products ?? [];
  const total = fetchedData?.total ?? 0;
  const totalPages = Math.ceil(total / (fetchedData?.limit ?? 20));
  const lowStockTotal = fetchedData?.low_stock_total ?? 0;

  const { data: pendingProducts = [], refetch: refetchPending } = useQuery({
    queryKey: ["products", "pending"],
    queryFn: productsApi.getPending,
    enabled: !isOffline && canEdit,
  });

  useEffect(() => {
    if (!searchQuery && page === 1 && fetchedProducts.length > 0) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(fetchedProducts));
    }
  }, [fetchedProducts, searchQuery, page]);

  const products = isOffline ? cachedProducts : fetchedProducts;

  const displayProducts = showLowStock
    ? [...products]
        .filter((p) => p.stock <= p.low_stock_threshold)
        .sort((a, b) => a.stock - b.stock)
    : products;

  const lowStockCount = isOffline
    ? products.filter((p) => p.stock <= p.low_stock_threshold).length
    : lowStockTotal;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const normalizeBarcode = (code: string) =>
    /^\d{12}$/.test(code) ? "0" + code : code;

  const handleBarcodeScan = async (rawCode: string) => {
    const code = normalizeBarcode(rawCode);
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
    if (isOffline) {
      forceRefreshCache();
    } else {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    }
    showToast(isOffline ? "Guardado sin conexión — se sincronizará al reconectarse" : "Producto guardado");
  };

  const confirmarEliminar = async () => {
    if (!selectedProduct) return;
    const confirmado = window.confirm(
      `¿Eliminar "${selectedProduct.name}"?\n\nEl producto dejará de aparecer en el inventario y no podrás escanearlo. Las ventas anteriores no se verán afectadas.`
    );
    if (!confirmado) return;

    if (isOffline) {
      try {
        const op: PendingProductOp = {
          id: crypto.randomUUID(),
          type: "delete",
          product_id: selectedProduct.id,
          synced: false,
          created_at: new Date().toISOString(),
        };
        await pendingProductsDb.add(op);
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const cache: Product[] = JSON.parse(raw);
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify(cache.filter((p) => p.id !== selectedProduct.id))
          );
        }
        setSelectedProduct(null);
        forceRefreshCache();
        showToast("Eliminado sin conexión — se sincronizará al reconectarse");
      } catch (err: unknown) {
        alert("Error al eliminar: " + (err instanceof Error ? err.message : String(err)));
      }
      return;
    }

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

      <Modal
        isOpen={showForm}
        onClose={handleCancel}
        title={editingProduct ? "Editar producto" : "Nuevo producto"}
        maxWidth={520}
      >
        <ProductForm
          product={editingProduct ?? undefined}
          initialBarcode={scannedBarcode ?? undefined}
          catalogData={catalogData ?? undefined}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      </Modal>

      {isOffline && (
        <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 rounded-[10px] bg-[#74b9ff]/[0.10] border border-[#74b9ff]/20">
          <span className="text-xs font-medium text-[#74b9ff]">Sin conexión · mostrando datos guardados</span>
        </div>
      )}

      {pendingProducts.length > 0 && (
        <button
          onClick={() => setShowPendingModal(true)}
          className="mx-4 mt-3 w-[calc(100%-2rem)] flex items-center gap-2 px-3 py-2.5 rounded-[10px] text-left"
          style={{ background: "rgba(255,217,61,0.08)", border: "1px solid rgba(255,217,61,0.25)" }}
        >
          <span className="text-base">⚡</span>
          <span className="text-sm font-semibold text-[#ffd93d]">
            {pendingProducts.length} producto{pendingProducts.length === 1 ? "" : "s"} Express pendiente{pendingProducts.length === 1 ? "" : "s"}
          </span>
          <span className="ml-auto text-xs text-[#ffd93d]/60">Revisar →</span>
        </button>
      )}

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
            onChange={(e) => { setSearchQuery(e.target.value.toUpperCase()); setPage(1); setShowLowStock(false); }}
            className="w-full h-11 pl-10 pr-4 rounded-[10px] bg-[#1a1a1a] border border-white/[0.08] text-[#f0f0f0] placeholder:text-[#666] focus:border-[#00e5a0] focus:outline-none focus:ring-1 focus:ring-[#00e5a0]/30"
          />
        </div>
      </header>

      {lowStockCount > 0 && !showLowStock && (
        <button
          onClick={() => setShowLowStock(true)}
          className="mx-4 mt-3 w-[calc(100%-2rem)] flex items-center gap-2 px-3 py-2.5 rounded-[10px] bg-[#ff9f43]/[0.12] border border-[#ff9f43]/25 text-left"
        >
          <AlertTriangle size={16} className="text-[#ff9f43] flex-shrink-0" />
          <span className="text-sm font-medium text-[#ff9f43]">
            {lowStockCount} producto{lowStockCount === 1 ? "" : "s"} con stock bajo
          </span>
          <span className="ml-auto text-xs text-[#ff9f43]/60">Ver →</span>
        </button>
      )}

      {showLowStock && (
        <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2.5 rounded-[10px] bg-[#ff6b6b]/[0.12] border border-[#ff6b6b]/30">
          <AlertTriangle size={16} className="text-[#ff6b6b] flex-shrink-0" />
          <span className="text-sm font-medium text-[#ff6b6b]">
            Mostrando {displayProducts.length} producto{displayProducts.length === 1 ? "" : "s"} con stock bajo
          </span>
          <button
            onClick={() => setShowLowStock(false)}
            className="ml-auto text-xs text-[#ff6b6b] font-semibold px-2 py-0.5 rounded bg-[#ff6b6b]/[0.15] hover:bg-[#ff6b6b]/25"
          >
            ✕ Ver todos
          </button>
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
          displayProducts.map((product) => (
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

      {!isOffline && totalPages > 1 && (
        <div className="px-4 pt-3 pb-1 flex items-center gap-3">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="flex-1 h-10 rounded-[10px] bg-[#1a1a1a] border border-white/[0.08] text-sm font-medium text-[#f0f0f0] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Anterior
          </button>
          <span className="text-xs text-[#555] flex-shrink-0 text-center whitespace-nowrap">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="flex-1 h-10 rounded-[10px] bg-[#1a1a1a] border border-white/[0.08] text-sm font-medium text-[#f0f0f0] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Siguiente →
          </button>
        </div>
      )}

      {!isOffline && total > 0 && (
        <p className="px-4 pt-2 pb-1 text-xs text-[#444] text-center">
          {total} producto{total !== 1 ? "s" : ""} en total
        </p>
      )}

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

      <Modal
        isOpen={showPendingModal}
        onClose={() => setShowPendingModal(false)}
        title="⚡ Productos Express"
        maxWidth={520}
      >
        <p className="text-sm text-[#666] mb-4">
          Productos creados durante ventas. Revisa costo y stock para mantener el inventario actualizado.
        </p>
        <div className="flex flex-col gap-3">
          {pendingProducts.map((product) => (
            <PendingProductCard
              key={product.id}
              product={product}
              onResolved={() => {
                refetchPending();
                queryClient.invalidateQueries({ queryKey: ["products"] });
                if (pendingProducts.length === 1) setShowPendingModal(false);
              }}
            />
          ))}
        </div>
      </Modal>

      <Navbar />
    </div>
  );
}
