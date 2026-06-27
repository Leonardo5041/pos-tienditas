import { apiFetch } from "./api";
import type { Sale, CreateSaleInput, PendingSale } from "../types/sale";

export const salesApi = {
  create: (data: CreateSaleInput) =>
    apiFetch<Sale>("/api/v1/sales", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  sync: (sales: Array<Pick<PendingSale, "id" | "items" | "payment_method" | "created_at">>, signal?: AbortSignal) =>
    apiFetch<{ synced: number; errors: { index: number; error: string }[] }>(
      "/api/v1/sales/sync",
      {
        method: "POST",
        body: JSON.stringify({ sales }),
        signal,
      }
    ),

  list: (params?: {
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
    cashier_id?: string;
    payment_method?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.offset != null) qs.set("offset", String(params.offset));
    if (params?.cashier_id) qs.set("cashier_id", params.cashier_id);
    if (params?.payment_method) qs.set("payment_method", params.payment_method);
    const qstr = qs.toString();
    return apiFetch<{ sales: Sale[]; total_amount: number; total_count: number }>(
      `/api/v1/sales${qstr ? "?" + qstr : ""}`
    );
  },

  get: (id: string) => apiFetch<Sale>(`/api/v1/sales/${id}`),
};
