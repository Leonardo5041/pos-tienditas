import { apiFetch } from "./api";
import type { CashRegister } from "../types/register";

export const registersApi = {
  current: () =>
    apiFetch<CashRegister | null>("/api/v1/registers/current"),

  open: (data: { initial_amount: number; cashier_id?: string }) =>
    apiFetch<CashRegister>("/api/v1/registers/open", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  close: (data: { declared_amount: number; notes?: string }) =>
    apiFetch<CashRegister>("/api/v1/registers/close", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  list: () =>
    apiFetch<CashRegister[]>("/api/v1/registers"),
};
