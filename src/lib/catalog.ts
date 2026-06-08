import { apiFetch } from "@/lib/api";
import type { CatalogResult } from "@/types/catalog";

export const catalogApi = {
  lookup: (barcode: string) =>
    apiFetch<CatalogResult>(`/api/v1/catalog/barcode/${encodeURIComponent(barcode)}`),
};
