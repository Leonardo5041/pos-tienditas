export type Product = {
  id: string;
  barcode: string | null;
  name: string;
  price: number;
  cost: number | null;
  stock: number;
  low_stock_threshold: number;
  unit: string;
};

export type CreateProductInput = {
  barcode?: string;
  name: string;
  price: number;
  cost?: number;
  stock: number;
  low_stock_threshold?: number;
  unit?: string;
};
