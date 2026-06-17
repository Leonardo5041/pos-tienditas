import { create } from "zustand";
import type { Product } from "@/types/product";
import type { CartItem } from "@/types/cart";

interface CartState {
  items: CartItem[];
  addItem: (product: Product) => void;
  removeItem: (product_id: string) => void;
  changeQty: (product_id: string, qty: number) => void;
  clear: () => void;
  total: () => number;
  itemCount: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addItem: (product) =>
    set((state) => {
      const existing = state.items.find((i) => i.product_id === product.id);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
          ),
        };
      }
      return {
        items: [
          ...state.items,
          { product_id: product.id, name: product.name, price: product.price, quantity: 1, unit: product.unit },
        ],
      };
    }),

  removeItem: (product_id) =>
    set((state) => ({ items: state.items.filter((i) => i.product_id !== product_id) })),

  changeQty: (product_id, qty) =>
    set((state) => ({
      items:
        qty <= 0
          ? state.items.filter((i) => i.product_id !== product_id)
          : state.items.map((i) => (i.product_id === product_id ? { ...i, quantity: qty } : i)),
    })),

  clear: () => set({ items: [] }),

  total: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),

  itemCount: () => get().items.reduce((sum, i) => sum + (!i.unit || i.unit === "pza" ? i.quantity : 1), 0),
}));
