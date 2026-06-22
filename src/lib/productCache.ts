import { productsApi } from "./products";
import type { Product } from "@/types/product";

export const PRODUCTS_CACHE_KEY = "products_cache";

export function readProductsCache(): Product[] {
  try {
    const raw = localStorage.getItem(PRODUCTS_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function writeProductsCache(products: Product[]) {
  localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(products));
}

export async function prefetchAllProducts(): Promise<void> {
  try {
    const PAGE_SIZE = 100;
    let page = 1;
    let all: Product[] = [];

    while (true) {
      const data = await productsApi.list({ limit: PAGE_SIZE, page });
      const items = data?.items ?? [];
      all = all.concat(items);
      if (all.length >= (data?.total ?? 0) || items.length < PAGE_SIZE) break;
      page++;
    }

    if (all.length > 0) {
      writeProductsCache(all);
    }
  } catch {
    // offline — keep existing cache
  }
}
