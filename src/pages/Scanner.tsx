import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ShoppingCart, Camera, CameraOff, Check, Loader2,
  Zap, ZapOff, Search, X, Plus, Monitor,
} from "lucide-react";
import { productsApi } from "@/lib/products";
import { readProductsCache, prefetchAllProducts, findByBarcode, searchByName } from "@/lib/productCache";
import { catalogApi } from "@/lib/catalog";
import { useCartStore } from "@/stores/cartStore";
import { useScanner } from "@/hooks/useScanner";
import { useGlobalScanner } from "@/hooks/useGlobalScanner";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useAuthStore } from "@/stores/authStore";
import type { Product } from "@/types/product";
import type { CatalogProduct } from "@/types/catalog";
import Navbar from "@/components/Navbar";
import Modal from "@/components/Modal";

type Feedback = { msg: string; kind: "ok" | "err" | "loading" } | null;

function BulkQtyInput({ value, unit, price, onChange }: { value: number; unit: string; price: number; onChange: (v: number) => void }) {
  const [qtyStr, setQtyStr] = useState(String(value));
  const [amtStr, setAmtStr] = useState((value * price).toFixed(2));
  const editingAmt = useRef(false);

  useEffect(() => {
    setQtyStr(String(value));
    if (!editingAmt.current) setAmtStr((value * price).toFixed(2));
  }, [value, price]);

  const handleQtyChange = (raw: string) => {
    setQtyStr(raw);
    const v = parseFloat(raw);
    if (!isNaN(v) && v > 0) {
      setAmtStr((v * price).toFixed(2));
      onChange(v);
    }
  };

  const handleAmtChange = (raw: string) => {
    setAmtStr(raw);
    const amt = parseFloat(raw);
    if (!isNaN(amt) && amt > 0 && price > 0) {
      const decimals = unit === "g" ? 0 : 3;
      const qty = parseFloat((amt / price).toFixed(decimals));
      if (qty > 0) {
        setQtyStr(String(qty));
        onChange(qty);
      }
    }
  };

  const qtyStep = unit === "g" ? "1" : "0.001";
  const qtyMin  = unit === "g" ? "1" : "0.001";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          type="number"
          inputMode="decimal"
          min={qtyMin}
          step={qtyStep}
          value={qtyStr}
          onChange={(e) => handleQtyChange(e.target.value)}
          onBlur={() => {
            const v = parseFloat(qtyStr);
            if (isNaN(v) || v <= 0) { setQtyStr(String(value)); setAmtStr((value * price).toFixed(2)); }
          }}
          className="w-20 h-7 rounded-[6px] bg-[#242424] border border-white/[0.14] text-[#f0f0f0] text-sm font-bold font-mono text-center focus:border-[#00e5a0] focus:outline-none"
        />
        <span style={{ fontSize: 11, color: "#666", minWidth: 20 }}>{unit}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <div style={{ position: "relative", width: 80 }}>
          <span style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#555", pointerEvents: "none" }}>$</span>
          <input
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={amtStr}
            onChange={(e) => handleAmtChange(e.target.value)}
            onFocus={() => { editingAmt.current = true; setAmtStr(""); }}
            onBlur={() => {
              editingAmt.current = false;
              setAmtStr((value * price).toFixed(2));
            }}
            style={{ paddingLeft: 14 }}
            className="w-full h-7 rounded-[6px] bg-[#242424] border border-white/[0.14] text-[#f0f0f0] text-sm font-mono text-center focus:border-[#00e5a0] focus:outline-none"
          />
        </div>
        <span style={{ fontSize: 11, color: "#444", minWidth: 20 }}>MXN</span>
      </div>
    </div>
  );
}

export default function Scanner() {
  const navigate = useNavigate();
  const bp = useBreakpoint();
  const isDesktop = bp === "desktop";

  const [feedback, setFeedback] = useState<Feedback>(null);
  const [lastAddedName, setLastAddedName] = useState<string | null>(null);
  const [popBadge, setPopBadge] = useState(false);
  const [catalogSheet, setCatalogSheet] = useState<CatalogProduct | null>(null);
  const [expressPrice, setExpressPrice] = useState("");
  const [expressLoading, setExpressLoading] = useState(false);
  const [expressError, setExpressError] = useState<string | null>(null);

  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [showUnknownModal, setShowUnknownModal] = useState(false);
  const [unknownName, setUnknownName] = useState("");
  const [unknownPrice, setUnknownPrice] = useState("");
  const [unknownError, setUnknownError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const prevItemCount = useRef(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const allProductsRef = useRef<Product[]>([]);

  const { user } = useAuthStore();
  const canCreate = user?.role === "owner" || user?.role === "inventory";

  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const changeQty = useCartStore((s) => s.changeQty);
  const total = useCartStore((s) => s.total());
  const itemCount = useCartStore((s) => s.itemCount());

  const normalizeBarcode = (code: string) =>
    /^\d{12}$/.test(code) ? "0" + code : code;

  const handleBarcodeScan = async (rawCode: string) => {
    const code = normalizeBarcode(rawCode);
    setFeedback({ msg: "", kind: "loading" });

    if (!navigator.onLine) {
      const product = await findByBarcode(code);
      if (product) {
        addItem(product);
        setLastAddedName(product.name);
        setFeedback({ msg: `${product.name} agregado`, kind: "ok" });
        setTimeout(() => setFeedback(null), 2000);
      } else {
        setFeedback({ msg: "Producto no encontrado", kind: "err" });
        setTimeout(() => setFeedback(null), 2000);
      }
      return;
    }

    try {
      const product = await productsApi.getByBarcode(code);
      addItem(product);
      setLastAddedName(product.name);
      setFeedback({ msg: `${product.name} agregado`, kind: "ok" });
      setTimeout(() => setFeedback(null), 2000);
      return;
    } catch {
      // no está en inventario
    }
    try {
      const result = await catalogApi.lookup(code);
      if (result.found) {
        setFeedback(null);
        setCatalogSheet(result);
      } else {
        setFeedback(null);
        setUnknownBarcode(code);
        setUnknownName("");
        setUnknownPrice("");
        setUnknownError("");
        setShowUnknownModal(true);
      }
    } catch {
      setFeedback(null);
      setUnknownBarcode(code);
      setUnknownName("");
      setUnknownPrice("");
      setUnknownError("");
      setShowUnknownModal(true);
    }
  };

  const { isScanning, error, startScan, stopScan, videoRef, cooldown,
          torchSupported, torchActive, toggleTorch } =
    useScanner(handleBarcodeScan);

  useGlobalScanner(handleBarcodeScan);

  useEffect(() => {
    const timer = setTimeout(() => { startScan(); }, 300);
    return () => { clearTimeout(timer); stopScan(); };
  }, [startScan, stopScan]);

  useEffect(() => {
    if (itemCount > prevItemCount.current) {
      setPopBadge(true);
      const t = setTimeout(() => setPopBadge(false), 200);
      prevItemCount.current = itemCount;
      return () => clearTimeout(t);
    }
    prevItemCount.current = itemCount;
  }, [itemCount]);

  // Load products from cache then refresh if online
  useEffect(() => {
    readProductsCache().then((products) => {
      allProductsRef.current = products;
    });
    if (navigator.onLine) {
      prefetchAllProducts().then(() => {
        readProductsCache().then((products) => {
          allProductsRef.current = products;
        });
      });
    }
    const handleOnline = () => {
      prefetchAllProducts().then(() => {
        readProductsCache().then((products) => {
          allProductsRef.current = products;
        });
      });
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  // Client-side search via IndexedDB cache (works offline)
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    searchByName(q).then((results) => {
      setSearchResults(results);
      setShowResults(true);
    });
  }, [searchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const container = document.getElementById("search-container");
      if (container && !container.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelectProduct = (product: Product) => {
    addItem(product);
    setSearchQuery("");
    setSearchResults([]);
    setShowResults(false);
    setFeedback({ msg: `${product.name} agregado`, kind: "ok" });
    setTimeout(() => setFeedback(null), 2000);
    searchRef.current?.focus();
  };

  const handleExpressAdd = async () => {
    if (!catalogSheet) return;
    const price = parseFloat(expressPrice);
    if (isNaN(price) || price <= 0) return;
    setExpressLoading(true);
    setExpressError(null);
    try {
      const result = await productsApi.createExpress({
        barcode: catalogSheet.barcode,
        name: catalogSheet.name,
        price,
      });
      const product: Product = {
        id: result.id,
        name: result.name,
        price: result.price,
        stock: result.stock,
        barcode: catalogSheet.barcode,
        cost: null,
        low_stock_threshold: 5,
        unit: "pza",
      };
      addItem(product);
      setLastAddedName(result.name);
      setFeedback({ msg: `${result.name} agregado`, kind: "ok" });
      setTimeout(() => setFeedback(null), 2000);
      setCatalogSheet(null);
      setExpressPrice("");
    } catch (err) {
      setExpressError(err instanceof Error ? err.message : "Error al agregar");
    } finally {
      setExpressLoading(false);
    }
  };

  const handleAddUnknown = async () => {
    const price = parseFloat(unknownPrice);
    if (!unknownName.trim()) {
      setUnknownError("El nombre es requerido");
      return;
    }
    if (isNaN(price) || price <= 0) {
      setUnknownError("El precio debe ser mayor a 0");
      return;
    }
    setIsCreating(true);
    setUnknownError("");
    try {
      const name = unknownName.trim().toUpperCase();
      const result = await productsApi.createExpress({
        barcode: unknownBarcode ?? "",
        name,
        price,
      });
      const product: Product = {
        id: result.id,
        name: result.name,
        price: result.price,
        stock: result.stock,
        barcode: unknownBarcode,
        cost: null,
        low_stock_threshold: 5,
        unit: "pza",
      };
      addItem(product);
      setLastAddedName(result.name);
      setFeedback({ msg: `⚡ ${result.name} agregado`, kind: "ok" });
      setTimeout(() => setFeedback(null), 2000);
      setShowUnknownModal(false);
    } catch (err) {
      setUnknownError(err instanceof Error ? err.message : "Error al agregar");
    } finally {
      setIsCreating(false);
    }
  };

  const statusLabel = error
    ? "SIN CÁMARA"
    : cooldown ? "PROCESANDO"
    : isScanning ? "EN VIVO"
    : null;

  const statusStyle = error
    ? { bg: "rgba(255,107,107,0.15)", border: "1px solid rgba(255,107,107,0.3)", color: "#ff6b6b" }
    : cooldown
    ? { bg: "rgba(0,0,0,0.5)", border: "none", color: "#999" }
    : torchActive
    ? { bg: "rgba(255,217,61,0.15)", border: "1px solid rgba(255,217,61,0.3)", color: "#ffd93d" }
    : { bg: "rgba(0,229,160,0.15)", border: "1px solid rgba(0,229,160,0.3)", color: "#00e5a0" };

  // ── Search bar ──────────────────────────────────────────────────────────

  const searchDropdown = showResults && (
    <div
      style={{
        position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
        zIndex: 30, background: "#1a1a1a",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 12, overflow: "hidden",
        maxHeight: 360, overflowY: "auto",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      {searchResults.length > 0 ? (
        searchResults.slice(0, 8).map((p) => {
          const stockNone = p.stock === 0;
          const stockLow  = p.stock > 0 && p.stock <= p.low_stock_threshold;
          const badge = stockNone
            ? { bg: "rgba(255,107,107,0.1)", color: "#ff6b6b", label: "Sin stock" }
            : stockLow
            ? { bg: "rgba(255,159,67,0.1)",  color: "#ff9f43", label: `${p.stock} uds` }
            : { bg: "rgba(0,229,160,0.1)",   color: "#00e5a0", label: `${p.stock} uds` };
          return (
            <div
              key={p.id}
              onClick={() => handleSelectProduct(p)}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "14px 16px", cursor: "pointer",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                transition: "background 0.1s",
              }}
            >
              <span style={{ fontSize: 24, flexShrink: 0 }}>📦</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 15, fontWeight: 600, color: "#f0f0f0",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {p.name}
                </div>
                {p.barcode && (
                  <div style={{ fontSize: 12, color: "#555", fontFamily: "DM Mono, monospace", marginTop: 2 }}>
                    {p.barcode}
                  </div>
                )}
              </div>
              <span style={{
                fontSize: 12, padding: "3px 9px", borderRadius: 20, flexShrink: 0,
                background: badge.bg, color: badge.color, fontWeight: 600,
              }}>
                {badge.label}
              </span>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#f0f0f0", fontFamily: "DM Mono, monospace", flexShrink: 0 }}>
                ${p.price.toFixed(2)}
              </div>
            </div>
          );
        })
      ) : (
        !isSearching && searchQuery.trim() && (
          <>
            <div style={{ paddingTop: 24, paddingBottom: canCreate ? 0 : 24, textAlign: "center" }}>
              <p style={{ fontSize: 14, color: "#555" }}>Sin resultados para "{searchQuery}"</p>
            </div>
            {canCreate && (
              <div
                onClick={() => {
                  setShowResults(false);
                  const isBarcode = /^\d+$/.test(searchQuery);
                  navigate(isBarcode
                    ? `/inventory?barcode=${encodeURIComponent(searchQuery)}`
                    : "/inventory"
                  );
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 16px", cursor: "pointer",
                  background: "rgba(0,229,160,0.04)",
                }}
              >
                <Plus size={16} color="#00e5a0" />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#00e5a0" }}>
                    Agregar "{searchQuery}" al inventario
                  </div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>
                    Ir a inventario para registrarlo
                  </div>
                </div>
              </div>
            )}
          </>
        )
      )}
    </div>
  );

  const searchInput = (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "0 16px", height: 48,
        background: "#1a1a1a",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 12, transition: "border-color 0.15s",
      }}
    >
      <Search size={16} style={{ color: "#555", flexShrink: 0 }} />
      <input
        ref={searchRef}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
        onKeyDown={(e) => {
          if (e.key === "Enter" && searchResults.length === 1) {
            handleSelectProduct(searchResults[0]);
          }
        }}
        placeholder="Buscar por nombre o código..."
        style={{
          flex: 1, background: "transparent", border: "none", outline: "none",
          fontSize: 14, color: "#f0f0f0",
        }}
      />
      {isSearching && (
        <Loader2 size={14} className="animate-spin" style={{ color: "#555", flexShrink: 0 }} />
      )}
      {searchQuery && !isSearching && (
        <button
          onClick={() => { setSearchQuery(""); setSearchResults([]); setShowResults(false); }}
          style={{
            width: 24, height: 24, borderRadius: "50%", background: "#333",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "none", cursor: "pointer", flexShrink: 0,
          }}
        >
          <X size={12} color="#666" />
        </button>
      )}
    </div>
  );

  // ── Camera zone ─────────────────────────────────────────────────────────

  const cameraContent = (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
      <div className="absolute inset-5 pointer-events-none">
        <div className="absolute top-0 left-0 w-6 h-6 border-t-[3px] border-l-[3px] border-[#00e5a0] rounded-tl-[3px]" />
        <div className="absolute top-0 right-0 w-6 h-6 border-t-[3px] border-r-[3px] border-[#00e5a0] rounded-tr-[3px]" />
        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-[3px] border-l-[3px] border-[#00e5a0] rounded-bl-[3px]" />
        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-[3px] border-r-[3px] border-[#00e5a0] rounded-br-[3px]" />
      </div>
      {isScanning && !cooldown && (
        <div
          className="absolute left-4 right-4 h-0.5 pointer-events-none"
          style={{
            background: "linear-gradient(90deg, transparent, #00e5a0, transparent)",
            boxShadow: "0 0 8px #00e5a0",
            animation: "scanLine 2s ease-in-out infinite",
          }}
        />
      )}
      {cooldown && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ background: "rgba(0,229,160,0.08)" }}
        >
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold"
            style={{ background: "rgba(0,229,160,0.9)", color: "#000" }}
          >
            <Check size={16} strokeWidth={3} />
            {lastAddedName
              ? lastAddedName.length > 13 ? lastAddedName.slice(0, 13) + "…" : lastAddedName
              : "Detectado"}
          </div>
        </div>
      )}
      {!isScanning && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <Camera size={32} style={{ color: "rgba(255,255,255,0.3)" }} />
          <button
            onClick={startScan}
            className="px-6 py-3 rounded-full text-sm font-semibold"
            style={{ background: "rgba(0,229,160,0.15)", border: "1px solid rgba(0,229,160,0.3)", color: "#00e5a0" }}
          >
            Activar cámara
          </button>
        </div>
      )}
      {error && (
        isDesktop ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            style={{ background: "#111" }}
          >
            <Monitor size={40} style={{ color: "#333" }} />
            <p style={{ fontSize: 14, color: "#555", textAlign: "center" }}>
              Usa el buscador para agregar productos
            </p>
            <p style={{ fontSize: 12, color: "#444", textAlign: "center", maxWidth: 200 }}>
              En desktop puedes buscar por nombre o código de barras usando el panel derecho
            </p>
            <button
              onClick={startScan}
              style={{ fontSize: 12, color: "#555", background: "none", border: "none", cursor: "pointer", marginTop: 4 }}
            >
              Intentar con cámara externa
            </button>
          </div>
        ) : (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-1"
            style={{ background: "rgba(0,0,0,0.7)" }}
          >
            <CameraOff size={32} style={{ color: "#ff6b6b" }} />
            <p className="text-sm mt-2" style={{ color: "#ff6b6b" }}>Sin acceso a la cámara</p>
            <button
              onClick={startScan}
              className="mt-3 px-5 py-2 rounded-full text-sm"
              style={{ background: "rgba(255,107,107,0.15)", border: "1px solid rgba(255,107,107,0.3)", color: "#ff6b6b" }}
            >
              Reintentar
            </button>
          </div>
        )
      )}
      {torchSupported && isScanning && (
        <button
          onClick={toggleTorch}
          aria-label={torchActive ? "Apagar flash" : "Encender flash"}
          className="absolute bottom-3 left-3 w-10 h-10 rounded-full flex items-center justify-center transition-all"
          style={torchActive
            ? { background: "rgba(255,217,61,0.2)", border: "1.5px solid rgba(255,217,61,0.5)" }
            : { background: "rgba(255,255,255,0.08)", border: "1.5px solid rgba(255,255,255,0.12)" }
          }
        >
          {torchActive
            ? <Zap size={18} style={{ color: "#ffd93d", fill: "#ffd93d" }} />
            : <ZapOff size={18} style={{ color: "rgba(255,255,255,0.4)" }} />
          }
        </button>
      )}
      {statusLabel && (
        <div
          className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ background: statusStyle.bg, border: statusStyle.border, color: statusStyle.color }}
        >
          {isScanning && !cooldown && !error && (
            <span className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: torchActive ? "#ffd93d" : "#00e5a0" }} />
          )}
          {torchActive && isScanning && !cooldown && !error ? "⚡ EN VIVO" : statusLabel}
        </div>
      )}
    </>
  );

  // ── Cart items ──────────────────────────────────────────────────────────

  const cartItemsList = items.length === 0 ? (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8">
      <ShoppingCart size={56} className="text-white opacity-20" />
      <p className="text-sm text-[#666]">
        {isDesktop ? "Busca un producto para comenzar" : "Escanea un producto para comenzar"}
      </p>
    </div>
  ) : (
    <>
      {items.map((item) => (
        <div
          key={item.product_id}
          className="bg-[#1a1a1a] border border-white/[0.08] rounded-[10px] px-4 py-3 flex items-center gap-3"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#f0f0f0] truncate">{item.name}</p>
            <p className="text-xs text-[#666] font-mono mt-0.5">${item.price.toFixed(2)} c/u</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {(!item.unit || item.unit === "pza") ? (
              <>
                <button
                  onClick={() => changeQty(item.product_id, item.quantity - 1)}
                  aria-label="Disminuir"
                  className="w-7 h-7 rounded-full bg-[#242424] border border-white/[0.14] text-[#f0f0f0] text-base font-bold flex items-center justify-center"
                >−</button>
                <span className="text-sm font-bold text-[#f0f0f0] font-mono min-w-[20px] text-center">
                  {item.quantity}
                </span>
                <button
                  onClick={() => changeQty(item.product_id, item.quantity + 1)}
                  aria-label="Aumentar"
                  className="w-7 h-7 rounded-full bg-[#00e5a0]/[0.12] border border-[#00e5a0]/25 text-[#00e5a0] text-base font-bold flex items-center justify-center"
                >+</button>
              </>
            ) : (
              <BulkQtyInput
                value={item.quantity}
                unit={item.unit}
                price={item.price}
                onChange={(v) => changeQty(item.product_id, v)}
              />
            )}
          </div>
          <p className="text-sm font-bold text-[#00e5a0] font-mono min-w-[52px] text-right flex-shrink-0">
            ${(item.price * item.quantity).toFixed(2)}
          </p>
          <button
            onClick={() => removeItem(item.product_id)}
            aria-label="Eliminar"
            className="ml-1 w-6 h-6 rounded-md text-[#666] hover:text-[#ff6b6b] text-sm flex items-center justify-center"
          >✕</button>
        </div>
      ))}
    </>
  );

  const totalBar = (
    <div className="bg-[#1a1a1a] border-t border-white/[0.08] px-4 py-3 flex items-center gap-4">
      <div className="flex-1">
        <p className="text-xs text-[#999] uppercase tracking-wider">Total</p>
        <p className="text-2xl font-bold text-[#f0f0f0] font-mono">${total.toFixed(2)}</p>
      </div>
      <button
        onClick={() => navigate("/payment")}
        disabled={items.length === 0}
        className="px-6 h-12 rounded-[10px] bg-[#00e5a0] text-black font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Cobrar →
      </button>
    </div>
  );

  // ── Catalog sheet ───────────────────────────────────────────────────────

  const catalogSheetUI = (
    <Modal
      isOpen={!!catalogSheet}
      onClose={() => { setCatalogSheet(null); setExpressPrice(""); setExpressError(null); }}
    >
      <div className="mb-4">
        <p className="text-xs font-semibold text-[#00e5a0] mb-1">✓ Encontrado en catálogo nacional</p>
        <p className="text-base font-semibold text-[#f0f0f0] truncate">{catalogSheet?.name}</p>
        <p className="text-sm text-[#999] truncate">
          {catalogSheet?.brand}{catalogSheet?.quantity ? ` · ${catalogSheet.quantity}` : ""}
        </p>
        <p className="text-xs text-[#666] font-mono mt-1">{catalogSheet?.barcode}</p>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-semibold text-[#666] uppercase tracking-wider mb-2">
          Precio de venta
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666] font-mono">$</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="0.00"
            autoFocus
            value={expressPrice}
            onChange={(e) => setExpressPrice(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleExpressAdd(); }}
            className="w-full h-11 bg-[#242424] border border-white/[0.14] rounded-[10px] pl-7 pr-4 text-[#f0f0f0] font-mono text-base focus:outline-none focus:border-[#00e5a0]"
          />
        </div>
      </div>

      {expressError && (
        <p className="text-xs text-[#ff6b6b] mb-3">{expressError}</p>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => { setCatalogSheet(null); setExpressPrice(""); setExpressError(null); }}
          className="flex-1 h-12 rounded-[10px] bg-[#242424] border border-white/[0.14] text-[#f0f0f0] font-semibold"
        >
          Cancelar
        </button>
        <button
          onClick={handleExpressAdd}
          disabled={expressLoading || !expressPrice || parseFloat(expressPrice) <= 0}
          className="flex-1 h-12 rounded-[10px] bg-[#00e5a0] text-black font-bold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {expressLoading ? "Agregando..." : "⚡ Agregar al carrito"}
        </button>
      </div>
    </Modal>
  );

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      className="bg-[#0f0f0f] flex flex-col"
      style={{ minHeight: "100vh", paddingBottom: isDesktop ? 0 : 80 }}
    >
      <style>{`
        @keyframes scanLine {
          0%, 100% { top: 12%; opacity: 0; }
          10%, 90% { opacity: 1; }
          50% { top: 80%; }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes pop {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.25); }
          100% { transform: scale(1); }
        }
      `}</style>

      <header className="px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => navigate("/dashboard")}
          aria-label="Volver"
          className="w-9 h-9 rounded-full bg-[#1a1a1a] border border-white/[0.08] text-white flex items-center justify-center"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-semibold text-[#f0f0f0] flex-1">Nueva venta</h1>
        {itemCount > 0 && (
          <span
            className="px-3 py-1 rounded-full bg-[#00e5a0] text-black text-sm font-bold"
            style={popBadge ? { animation: "pop 0.2s ease" } : {}}
          >
            {itemCount} item{itemCount === 1 ? "" : "s"}
          </span>
        )}
      </header>

      {isDesktop ? (
        // ── Desktop 2-col ─────────────────────────────────────────────────
        <div
          style={{
            display: "flex", flex: 1, gap: 16,
            padding: "0 16px 16px", overflow: "hidden",
            minHeight: 0,
          }}
        >
          {/* Left: Camera — hidden when no camera access */}
          {!error && (
            <div style={{ flex: "0 0 380px", display: "flex", flexDirection: "column" }}>
              <div
                className="relative overflow-hidden"
                style={{
                  flex: 1, background: "#000",
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.08)",
                  minHeight: 300,
                }}
              >
                {cameraContent}
              </div>
            </div>
          )}

          {/* Right: Search + Cart + Total */}
          <div
            style={{
              flex: 1, display: "flex", flexDirection: "column",
              minWidth: 0, overflow: "hidden",
              background: "#111",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ padding: "16px 16px 0", flexShrink: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                Nueva venta
              </p>
              <div id="search-container" style={{ position: "relative" }}>
                {searchInput}
                {searchDropdown}
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "12px 0 0" }} />
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {cartItemsList}
            </div>

            {totalBar}
          </div>
        </div>
      ) : (
        // ── Mobile layout ─────────────────────────────────────────────────
        <>
          {/* Camera */}
          <div
            className="mx-4 mt-2 relative overflow-hidden"
            style={{
              background: "#000", borderRadius: 16,
              height: 220, border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {cameraContent}
          </div>

          {/* Search */}
          <div id="search-container" style={{ margin: "12px 16px 0", position: "relative" }}>
            {searchInput}
            {searchDropdown}
          </div>

          {/* Feedback */}
          <div className="mx-4 mt-2 h-8 flex items-center">
            {feedback?.kind === "loading" && (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" style={{ color: "#666" }} />
                <span className="text-sm" style={{ color: "#666" }}>Buscando...</span>
              </span>
            )}
            {feedback?.kind === "ok" && (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00e5a0] animate-pulse" />
                <span className="text-sm font-medium" style={{ color: "#00e5a0" }}>✓ {feedback.msg}</span>
              </span>
            )}
            {feedback?.kind === "err" && (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: "#ff6b6b" }} />
                <span className="text-sm" style={{ color: "#ff6b6b" }}>Producto no encontrado</span>
              </span>
            )}
            {!feedback && (
              <p className="text-xs text-center w-full" style={{ color: "#555" }}>
                Apunta al código de barras
              </p>
            )}
          </div>

          {/* Cart list */}
          <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-2 pb-20">
            {cartItemsList}
          </div>

          {/* Total — fixed above navbar */}
          <div className="fixed left-0 right-0 z-20" style={{ bottom: "calc(64px + env(safe-area-inset-bottom))" }}>
            {totalBar}
          </div>
        </>
      )}

      {catalogSheetUI}

      <Modal
        isOpen={showUnknownModal}
        onClose={() => setShowUnknownModal(false)}
        title="Producto no registrado"
        maxWidth={380}
      >
        <p className="text-xs font-mono mb-4" style={{ color: "#444" }}>{unknownBarcode}</p>

        <div className="flex flex-col gap-3 mb-4">
          <div>
              <label className="block text-xs font-semibold text-[#666] uppercase tracking-wider mb-2">
                Nombre
              </label>
              <input
                type="text"
                autoFocus
                placeholder="NOMBRE DEL PRODUCTO"
                value={unknownName}
                onChange={(e) => setUnknownName(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddUnknown(); }}
                className="w-full h-11 bg-[#242424] border border-white/[0.14] rounded-[10px] px-4 text-[#f0f0f0] text-sm font-semibold uppercase focus:outline-none focus:border-[#00e5a0]"
              />
            </div>

          <div>
            <label className="block text-xs font-semibold text-[#666] uppercase tracking-wider mb-2">
              Precio de venta
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666] font-mono">$</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="0.00"
                autoFocus={false}
                value={unknownPrice}
                onChange={(e) => setUnknownPrice(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddUnknown(); }}
                className="w-full h-11 bg-[#242424] border border-white/[0.14] rounded-[10px] pl-7 pr-4 text-[#f0f0f0] font-mono text-base focus:outline-none focus:border-[#00e5a0]"
              />
            </div>
          </div>
        </div>

        {unknownError && (
          <p className="text-xs text-[#ff6b6b] mb-3">{unknownError}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => setShowUnknownModal(false)}
            className="flex-1 h-12 rounded-[10px] bg-[#242424] border border-white/[0.14] text-[#f0f0f0] font-semibold"
          >
            Cancelar
          </button>
          <button
            onClick={handleAddUnknown}
            disabled={isCreating}
            className="flex-1 h-12 rounded-[10px] bg-[#00e5a0] text-black font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isCreating ? "Agregando..." : "⚡ Agregar"}
          </button>
        </div>
      </Modal>

      <Navbar />
    </div>
  );
}
