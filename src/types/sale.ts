export type SaleItem = {
  product_id?: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal?: number;
};

export type SaleWarning = {
  product_name: string;
  message: string;
};

export type Sale = {
  id: string;
  total: number;
  payment_method: "cash" | "card" | "transfer" | "credit";
  cashier_id?: string;
  cashier_name?: string;
  items: SaleItem[];
  created_at: string;
  synced_offline?: boolean;
  offline?: boolean;
  warnings?: SaleWarning[];
};

export type CreateSaleInput = {
  items: { product_id: string; quantity: number }[];
  payment_method: "cash" | "card" | "transfer" | "credit";
  customer_id?: string;
};

export type PendingSale = CreateSaleInput & {
  id: string;
  created_at: string;
  synced: boolean;
  retries?: number;
  failed?: boolean;
};

export type ReceiptData = {
  id: string;
  total: number;
  paymentMethod: string;
  items: { name: string; quantity: number; price: number }[];
  createdAt: string;
  isOffline: boolean;
};
