export type ReceiptItemStatus = 'matched' | 'review' | 'new' | 'skipped'

export type ReceiptItem = {
  id: string
  ai_product_name: string
  matched_product_id: string | null
  matched_product_name: string | null
  match_source: 'inventory' | 'catalog' | 'none'
  is_new_product: boolean
  new_product_name?: string
  new_product_barcode?: string
  quantity: number
  unit_cost: number
  subtotal: number
  confidence_score: number
  status: ReceiptItemStatus
}

export type ProcessedReceipt = {
  receipt_id: string
  supplier: string | null
  date: string | null
  total: number
  items: ReceiptItem[]
}

export type ReceiptSummary = {
  id: string
  supplier_name: string
  receipt_date: string
  total_amount: number
  status: string
  item_count: number
  created_at: string
}

export type ConfirmItem = {
  ai_product_name: string
  matched_product_id: string | null
  is_new_product: boolean
  quantity: number
  unit_cost: number
  sale_price?: number
}

export type ConfirmReceiptInput = {
  receipt_id: string
  supplier_name: string
  receipt_date: string
  total_amount: number
  items: ConfirmItem[]
}

export type ConfirmReceiptResult = {
  products_updated: number
  products_created: number
  expense_registered: boolean
}
