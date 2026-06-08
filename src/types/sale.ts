export type SaleItem = {
  product_id?: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal?: number;
};

export type Sale = {
  id: string;
  total: number;
  payment_method: "cash" | "card" | "transfer";
  items: SaleItem[];
  created_at: string;
  offline?: boolean;
};

export type CreateSaleInput = {
  items: { product_id: string; quantity: number }[];
  payment_method: "cash" | "card" | "transfer";
};

export type PendingSale = CreateSaleInput & {
  id: string;
  created_at: string;
  synced: boolean;
};

export type ReceiptData = {
  id: string;
  total: number;
  paymentMethod: string;
  items: { name: string; quantity: number; price: number }[];
  createdAt: string;
  isOffline: boolean;
};
