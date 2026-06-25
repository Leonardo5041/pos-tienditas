import { create } from "zustand";
import { posDb } from "@/lib/db";

interface User {
  id: string;
  name: string;
  role: string;
}

interface Store {
  id: string;
  name: string;
  slug: string;
  plan: string;
  effective_plan: string;
  is_on_trial: boolean;
  trial_days_left: number;
  trial_ends_at: string | null;
  has_access: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
  store: Store;
}

interface AuthState {
  token: string | null;
  user: User | null;
  store: Store | null;
  isAuthenticated: boolean;
  login: (data: LoginResponse) => void;
  logout: () => Promise<void>;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  store: null,
  isAuthenticated: false,

  login: (data) => {
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("store", JSON.stringify(data.store));
    set({ token: data.token, user: data.user, store: data.store, isAuthenticated: true });
  },

  logout: async () => {
    const pending = await posDb.pendingSales.where("synced").equals(0).count();
    if (pending > 0) {
      const ok = window.confirm(
        `Tienes ${pending} venta${pending > 1 ? "s" : ""} sin sincronizar.\n\nSi cierras sesión se perderán.\n¿Deseas continuar?`
      );
      if (!ok) return;
    }
    await posDb.pendingSales.clear();
    await posDb.productsCache.clear();
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("store");
    set({ token: null, user: null, store: null, isAuthenticated: false });
  },

  hydrate: () => {
    const token = localStorage.getItem("token");
    const user = localStorage.getItem("user");
    const store = localStorage.getItem("store");
    if (token && user && store) {
      set({
        token,
        user: JSON.parse(user) as User,
        store: JSON.parse(store) as Store,
        isAuthenticated: true,
      });
    }
  },
}));
