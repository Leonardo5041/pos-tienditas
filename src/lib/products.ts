import { apiFetch } from "./api";
import type { Product, CreateProductInput } from "../types/product";

export type ProductsPage = {
  products: Product[];
  total: number;
  page: number;
  limit: number;
  low_stock_total: number;
};

export const productsApi = {
  list: (params?: { search?: string; low_stock?: boolean; no_barcode?: boolean; generated?: boolean; page?: number; limit?: number; active?: boolean }) => {
    const qs = params
      ? new URLSearchParams(
          Object.fromEntries(
            Object.entries(params)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, String(v)])
          )
        ).toString()
      : "";
    return apiFetch<ProductsPage>(`/api/v1/products${qs ? "?" + qs : ""}`);
  },

  getByBarcode: (code: string) =>
    apiFetch<Product & { is_inactive?: boolean }>(`/api/v1/products/barcode/${code}`),

  reactivate: (id: string) =>
    apiFetch<Product>(`/api/v1/products/${id}/reactivate`, { method: "POST" }),

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

  createExpress: (data: { barcode: string; name: string; price: number }) =>
    apiFetch<{ id: string; name: string; price: number; stock: number }>("/api/v1/products/express", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getPending: () =>
    apiFetch<Product[]>("/api/v1/products/pending"),

  resolve: (id: string, data: { cost?: number; stock?: number; low_stock_threshold?: number }) =>
    apiFetch<{ message: string }>(`/api/v1/products/${id}/resolve`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  generateBarcode: (id: string) =>
    apiFetch<{ id: string; name: string; barcode: string }>(
      `/api/v1/products/${id}/generate-barcode`,
      { method: "POST" }
    ),
};
