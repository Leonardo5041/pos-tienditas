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

  list: (params?: { from?: string; to?: string; limit?: number }) => {
    const qs = params
      ? new URLSearchParams(
          Object.fromEntries(
            Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
          )
        ).toString()
      : "";
    return apiFetch<{ sales: Sale[]; total_amount: number; total_count: number }>(
      `/api/v1/sales${qs ? "?" + qs : ""}`
    );
  },

  get: (id: string) => apiFetch<Sale>(`/api/v1/sales/${id}`),
};
