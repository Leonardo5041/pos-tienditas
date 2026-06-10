import type { CreateProductInput } from "./product";

export type PendingProductOp = {
  id: string;
  type: "create" | "update" | "delete";
  product_id?: string;
  temp_id?: string;
  payload?: CreateProductInput;
  synced: boolean;
  created_at: string;
};
