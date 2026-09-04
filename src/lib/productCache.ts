import { productsApi } from "./products";
import { posDb } from "./db";
import type { Product } from "@/types/product";

let isFetching = false;

export async function prefetchAllProducts(): Promise<void> {
  if (isFetching) return;
  isFetching = true;

  try {
    const all: Product[] = [];
    let page = 1;
    const PAGE_SIZE = 100;

    while (true) {
      const res = await productsApi.list({ page, limit: PAGE_SIZE });
      const items = res.products ?? [];
      const total = res.total ?? items.length;

      all.push(...items);

      if (all.length >= total || items.length < PAGE_SIZE) break;
      page++;
    }

    if (all.length > 0) {
      await writeProductsCache(all);
    }
  } catch {
    // offline — mantener cache anterior
  } finally {
    isFetching = false;
  }
}

export async function writeProductsCache(products: Product[]): Promise<void> {
  await posDb.productsCache.clear();
  await posDb.productsCache.bulkPut(products);
}

export async function readProductsCache(): Promise<Product[]> {
  return await posDb.productsCache.toArray();
}

export async function findByBarcode(barcode: string): Promise<Product | undefined> {
  return await posDb.productsCache.where("barcode").equals(barcode).first();
}

export async function searchByName(query: string): Promise<Product[]> {
  const q = query.toUpperCase();
  return await posDb.productsCache
    .filter((p) => p.name.toUpperCase().includes(q) || (p.barcode ?? "").toUpperCase().includes(q))
    .limit(10)
    .toArray();
}
