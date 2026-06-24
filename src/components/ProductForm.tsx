import { useState } from "react";
import { Camera, Lock, ChevronDown, ChevronUp, X, Check, Loader2 } from "lucide-react";
import { productsApi } from "@/lib/products";
import { catalogApi } from "@/lib/catalog";
import { pendingProductsDb } from "@/lib/db";
import type { Product } from "@/types/product";
import type { CatalogProduct } from "@/types/catalog";
import type { PendingProductOp } from "@/types/pending-product";
import BarcodeScanner from "@/components/BarcodeScanner";

const CACHE_KEY = "products_cache";

interface Props {
  product?: Product;
  initialBarcode?: string;
  catalogData?: CatalogProduct;
  onSave: (product: Product) => void;
  onCancel: () => void;
}

const labelCls = "text-xs text-[#999] uppercase tracking-wider mb-1.5 block";
const inputCls =
  "w-full bg-[#1a1a1a] border border-white/[0.08] rounded-[10px] px-4 h-12 text-[#f0f0f0] text-base placeholder:text-[#666] focus:border-[#00e5a0] focus:outline-none focus:ring-1 focus:ring-[#00e5a0]/30";

export default function ProductForm({ product, initialBarcode, catalogData, onSave, onCancel }: Props) {
  const fromCatalog = !!catalogData && !product;
  const [barcode, setBarcode] = useState(
    product?.barcode ?? catalogData?.barcode ?? initialBarcode ?? ""
  );
  const [name, setName] = useState(() => {
    if (product?.name) return product.name;
    if (catalogData) {
      const parts = [catalogData.name, catalogData.brand, catalogData.quantity].filter(Boolean);
      return parts.join(", ").toUpperCase();
    }
    return "";
  });
  const [price, setPrice] = useState(product?.price?.toString() ?? "");
  const [cost, setCost] = useState(product?.cost?.toString() ?? "");
  const [stock, setStock] = useState(product?.stock?.toString() ?? "0");
  const [threshold, setThreshold] = useState(
    product?.low_stock_threshold?.toString() ??
    ((product?.unit ?? "pza") === "kg" ? "0.100" : "2")
  );
  const [unit, setUnit] = useState(product?.unit ?? "pza");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [editExtras, setEditExtras] = useState(false);

  const handleInlineScan = async (code: string) => {
    setBarcode(code);
    setShowScanner(false);
    try {
      const result = await catalogApi.lookup(code);
      if (result.found) {
        const parts = [result.name, result.brand, result.quantity].filter(Boolean);
        setName(parts.join(", ").toUpperCase());
      }
    } catch {
      // si falla lookup, solo queda el barcode
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !price) {
      setError("Nombre y precio son requeridos");
      return;
    }
    setError(null);
    setLoading(true);

    const data = {
      barcode: barcode.trim() || undefined,
      name: name.trim(),
      price: parseFloat(price),
      cost: cost ? parseFloat(cost) : undefined,
      stock: unit === "pza" ? (parseInt(stock) || 0) : (parseFloat(stock) || 0),
      low_stock_threshold: parseFloat(threshold) || 5,
      unit,
    };

    try {
      if (!navigator.onLine) {
        const cache: Product[] = (() => {
          try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "[]"); } catch { return []; }
        })();

        if (product) {
          const op: PendingProductOp = {
            id: crypto.randomUUID(),
            type: "update",
            product_id: product.id,
            payload: data,
            synced: false,
            created_at: new Date().toISOString(),
          };
          await pendingProductsDb.add(op);
          const updated: Product = {
            ...product,
            ...data,
            barcode: data.barcode ?? null,
            cost: data.cost ?? null,
          };
          const idx = cache.findIndex((p) => p.id === product.id);
          if (idx >= 0) cache[idx] = updated;
          localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
          onSave(updated);
        } else {
          const tempId = "tmp_" + crypto.randomUUID();
          const op: PendingProductOp = {
            id: crypto.randomUUID(),
            type: "create",
            temp_id: tempId,
            payload: data,
            synced: false,
            created_at: new Date().toISOString(),
          };
          await pendingProductsDb.add(op);
          const newProduct: Product = {
            id: tempId,
            barcode: data.barcode ?? null,
            name: data.name,
            price: data.price,
            cost: data.cost ?? null,
            stock: data.stock,
            low_stock_threshold: data.low_stock_threshold ?? 5,
            unit: data.unit ?? "pza",
          };
          cache.unshift(newProduct);
          localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
          onSave(newProduct);
        }
      } else {
        const saved = product
          ? await productsApi.update(product.id, data)
          : await productsApi.create(data);
        onSave(saved);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {showScanner && (
        <BarcodeScanner onDetected={handleInlineScan} onClose={() => setShowScanner(false)} />
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {fromCatalog && catalogData && (
          <div className="rounded-[14px] bg-[#00e5a0]/[0.08] border border-[#00e5a0]/25 p-3">
            <p className="text-xs font-semibold text-[#00e5a0] mb-1">
              ✓ Encontrado en catálogo nacional
            </p>
            <p className="text-sm font-semibold text-[#f0f0f0] truncate">{catalogData.name}</p>
            <p className="text-xs text-[#999] truncate">
              {catalogData.brand}
              {catalogData.quantity ? ` · ${catalogData.quantity}` : ""}
            </p>
          </div>
        )}

        <div>
          <label className={labelCls}>Código de barras</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                className={inputCls + (fromCatalog ? " pr-10 text-[#999]" : "")}
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Opcional"
                readOnly={fromCatalog}
              />
              {fromCatalog && (
                <Lock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666]" />
              )}
            </div>
            {!fromCatalog && (
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                aria-label="Escanear código"
                className="w-12 h-12 rounded-[10px] bg-[#00e5a0]/[0.12] border border-[#00e5a0]/25 text-[#00e5a0] text-xl flex items-center justify-center"
              >
                <Camera size={20} />
              </button>
            )}
          </div>
        </div>

        {!fromCatalog && (
          <div>
            <label className={labelCls}>Nombre *</label>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              placeholder="Ej. Coca Cola 600ml"
              required
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls + " text-[#00e5a0]"}>Precio de venta *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className={inputCls + " font-mono border-[#00e5a0]/30 focus:border-[#00e5a0]"}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              required
              autoFocus={fromCatalog}
            />
          </div>
          <div>
            <label className={labelCls + " text-[#ff9f43]"}>Precio de compra</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className={inputCls + " font-mono border-[#ff9f43]/25 focus:border-[#ff9f43]"}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Stock inicial</label>
            <input
              type="number"
              min="0"
              step={unit === "pza" ? "1" : "0.001"}
              className={inputCls + " font-mono"}
              value={stock}
              onChange={(e) => {
                const val = unit === "pza"
                  ? e.target.value.replace(/[^0-9]/g, "")
                  : e.target.value;
                setStock(val);
              }}
              placeholder={unit === "pza" ? "0" : "0.000"}
            />
          </div>
          <div>
            <label className={labelCls}>Alerta stock bajo</label>
            <input
              type="number"
              min="0"
              step={unit === "pza" ? "1" : "0.001"}
              className={inputCls + " font-mono"}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder={unit === "pza" ? "5" : "0.5"}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Tipo de venta</label>
          <div className="grid grid-cols-2 gap-2">
            {(["pza", "kg"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => {
                  setUnit(u);
                  if (u === "pza") {
                    setStock(String(Math.floor(parseFloat(stock) || 0)));
                    if (!product) setThreshold("2");
                  } else {
                    if (!product) setThreshold("0.100");
                  }
                }}
                className={`h-11 rounded-[10px] text-sm font-semibold border transition-colors ${
                  unit === u
                    ? "bg-[#00e5a0]/[0.15] border-[#00e5a0]/50 text-[#00e5a0]"
                    : "bg-[#1a1a1a] border-white/[0.08] text-[#666]"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
          <p className="text-xs text-[#555] mt-1.5">
            {unit === "pza" ? "Venta por pieza — botones +/−" : `Venta a granel por ${unit} — campo numérico`}
          </p>
        </div>

        {fromCatalog && (
          <div className="border-t border-white/[0.08] pt-3">
            <button
              type="button"
              onClick={() => setEditExtras((v) => !v)}
              className="w-full flex items-center justify-between text-sm text-[#999] py-2"
            >
              <span className="flex items-center gap-2">
                <span>✏</span>
                <span>Editar nombre y categoría</span>
              </span>
              {editExtras ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {editExtras && (
              <div className="mt-2">
                <label className={labelCls}>Nombre</label>
                <input
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  placeholder="Nombre del producto"
                />
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="px-4 py-2.5 rounded-[10px] bg-[#ff6b6b]/[0.10] border border-[#ff6b6b]/20 text-[13px] text-[#ff6b6b] text-center">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={onCancel}
            className="h-11 px-5 rounded-[10px] bg-[#242424] border border-white/[0.08] text-[#999] text-sm font-medium flex items-center gap-1.5"
          >
            <X size={15} color="#666" />
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="h-11 px-5 rounded-[10px] bg-[#00e5a0] text-black text-[15px] font-bold flex items-center gap-2 whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed transition-opacity duration-150"
          >
            {loading ? (
              <>
                <Loader2 size={16} color="#000" className="animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Check size={18} color="#000" strokeWidth={2.5} />
                Guardar
              </>
            )}
          </button>
        </div>
      </form>
    </>
  );
}
