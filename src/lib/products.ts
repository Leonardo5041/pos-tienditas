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
  list: (params?: { search?: string; low_stock?: boolean; page?: number; limit?: number }) => {
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
};
