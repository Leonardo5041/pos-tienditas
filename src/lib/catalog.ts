import { apiFetch } from "@/lib/api";
import type { CatalogResult } from "@/types/catalog";

export type CatalogSearchItem = {
  barcode: string;
  name: string;
  brand: string;
  quantity: string;
};

export const catalogApi = {
  lookup: (barcode: string) =>
    apiFetch<CatalogResult>(`/api/v1/catalog/barcode/${encodeURIComponent(barcode)}`),
  search: (q: string) =>
    apiFetch<CatalogSearchItem[]>(`/api/v1/catalog/search?q=${encodeURIComponent(q)}`),
};
