export type CatalogProduct = {
  found: true;
  barcode: string;
  name: string;
  brand: string;
  category: string;
  image_url: string;
  quantity: string;
};

export type CatalogMiss = { found: false };

export type CatalogResult = CatalogProduct | CatalogMiss;
