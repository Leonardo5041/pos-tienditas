import { apiFetch } from "./api";
import type { Product, CreateProductInput } from "../types/product";

export const productsApi = {
  list: (params?: { search?: string; low_stock?: boolean }) => {
    const qs = params
      ? new URLSearchParams(
          Object.fromEntries(
            Object.entries(params)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, String(v)])
          )
        ).toString()
      : "";
    return apiFetch<Product[]>(`/api/v1/products${qs ? "?" + qs : ""}`);
  },

  getByBarcode: (code: string) =>
    apiFetch<Product>(`/api/v1/products/barcode/${code}`),

  create: (data: CreateProductInput) =>
    apiFetch<Product>("/api/v1/products", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<CreateProductInput>) =>
    apiFetch<Product>(`/api/v1/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    apiFetch<{ message: string }>(`/api/v1/products/${id}`, {
      method: "DELETE",
    }),
};
