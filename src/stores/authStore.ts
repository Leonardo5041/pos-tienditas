import { create } from "zustand";

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
  logout: () => void;
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

  logout: () => {
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
