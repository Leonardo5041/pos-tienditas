import { apiFetch } from "./api";
import type { CreditAccount, CreditTransaction } from "../types/credit";

export const creditApi = {
  list: (search?: string) => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    return apiFetch<CreditAccount[]>(`/api/v1/credit${qs}`);
  },

  search: (query: string) =>
    apiFetch<CreditAccount[]>(`/api/v1/credit?search=${encodeURIComponent(query)}`),

  summary: () =>
    apiFetch<{ total_owed: number; accounts_count: number; overdue_count: number }>(
      "/api/v1/credit/summary"
    ),

  create: (data: { customer_name: string; customer_phone?: string }) =>
    apiFetch<CreditAccount>("/api/v1/credit", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  charge: (id: string, amount: number, note?: string) =>
    apiFetch<{ id: string; balance_new: number }>(`/api/v1/credit/${id}/charge`, {
      method: "POST",
      body: JSON.stringify({ amount, note }),
    }),

  pay: (id: string, amount: number, paymentMethod?: string) =>
    apiFetch<{ id: string; balance_new: number }>(`/api/v1/credit/${id}/pay`, {
      method: "POST",
      body: JSON.stringify({ amount, payment_method: paymentMethod ?? "cash" }),
    }),

  transactions: (id: string) =>
    apiFetch<CreditTransaction[]>(`/api/v1/credit/${id}/transactions`),

  update: (id: string, data: { customer_name?: string; customer_phone?: string }) =>
    apiFetch<CreditAccount>(`/api/v1/credit/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    apiFetch<{ message: string }>(`/api/v1/credit/${id}`, { method: "DELETE" }),
};
